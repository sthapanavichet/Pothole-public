"""Capture pothole candidates offline and upload them to the cloud when connected."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import time
from typing import Any

import cv2
import requests

from camera import CameraManager
from candidate_detector import PotholeCandidateDetector
from capture_store import CaptureStore, PendingCapture


DEFAULT_API_URL = "https://api-mu-ten-54.vercel.app"


class CloudUploader:
    """Probe the cloud API and deliver pending captures as pothole reports."""

    def __init__(self, api_url: str, api_write_key: str, store: CaptureStore) -> None:
        self.api_url = api_url.rstrip("/")
        self.api_write_key = api_write_key
        self.store = store

    def _headers(self) -> dict[str, str]:
        return {"X-API-Key": self.api_write_key}

    def is_cloud_connected(self) -> bool:
        try:
            response = requests.get(f"{self.api_url}/api/health", timeout=2)
            response.raise_for_status()
            return response.json().get("service") == "pothole-api"
        except (requests.RequestException, ValueError):
            return False

    def upload_pending(self, limit: int) -> int:
        uploaded = 0
        for capture in self.store.pending_captures(limit):
            try:
                self._upload_one(capture)
                uploaded += 1
            except (OSError, requests.RequestException, ValueError) as exc:
                self.store.mark_upload_failed(capture.capture_id, str(exc))
                print(f"Upload deferred for {capture.capture_id}: {exc}")
                break
        return uploaded

    def _upload_one(self, capture: PendingCapture) -> None:
        image_bytes = capture.image_path.read_bytes()
        metadata = {
            "capture_id": capture.capture_id,
            "captured_at": capture.captured_at,
            "image_sha256": capture.image_sha256,
            "gps_status": capture.gps_status,
            "detections": capture.candidate_detections,
            "detection_count": len(capture.candidate_detections),
            "source": "raspberry_pi",
            "models_used": sorted(
                {
                    detection.get("model")
                    for detection in capture.candidate_detections
                    if detection.get("model")
                }
            ),
        }
        form_data = {"metadata": json.dumps(metadata), "status": "pending"}
        if capture.latitude is not None:
            form_data["latitude"] = str(capture.latitude)
        if capture.longitude is not None:
            form_data["longitude"] = str(capture.longitude)

        response = requests.post(
            f"{self.api_url}/api/reports",
            data=form_data,
            files={"image": (capture.image_path.name, image_bytes, "image/jpeg")},
            headers=self._headers(),
            timeout=(3.05, 120),
        )
        response.raise_for_status()
        result = response.json()
        if not result.get("report", {}).get("id"):
            raise ValueError("Cloud API acknowledgement does not include a report ID.")
        self.store.mark_uploaded(capture.capture_id, result)


def parse_args() -> argparse.Namespace:
    base_dir = Path(__file__).resolve().parent
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--api-url",
        default=os.getenv("POTHOLE_API_URL", DEFAULT_API_URL),
        help="Cloud API base URL. The agent is offline while it is unreachable.",
    )
    parser.add_argument(
        "--api-write-key",
        default=os.getenv("POTHOLE_API_WRITE_KEY"),
        help="API write key required to create cloud reports.",
    )
    parser.add_argument("--database", default=base_dir / "data" / "captures.db")
    parser.add_argument("--image-dir", default=base_dir / "data" / "captures")
    parser.add_argument(
        "--candidate-model",
        default=os.getenv("PI_CANDIDATE_MODEL_PATH"),
        help="Pothole-capable YOLO weights used as the Pi capture trigger.",
    )
    parser.add_argument("--confidence", type=float, default=0.35)
    parser.add_argument("--check-interval", type=float, default=2.0)
    parser.add_argument("--candidate-interval", type=float, default=1.0)
    parser.add_argument("--capture-cooldown", type=float, default=15.0)
    parser.add_argument("--max-upload-batch", type=int, default=10)
    parser.add_argument(
        "--demo-capture-interval",
        type=float,
        default=0.0,
        help="Capture camera frames on a timer without a candidate model. Demo only.",
    )
    parser.add_argument(
        "--max-runtime-seconds",
        type=float,
        default=0.0,
        help="Stop after this duration. Zero means run continuously.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if not args.candidate_model and args.demo_capture_interval <= 0:
        raise SystemExit(
            "Set --candidate-model for live pothole capture, or use "
            "--demo-capture-interval for the dock-state demonstration."
        )
    if not args.api_write_key:
        raise SystemExit(
            "Set POTHOLE_API_WRITE_KEY or pass --api-write-key before uploading reports."
        )

    store = CaptureStore(args.database, args.image_dir)
    uploader = CloudUploader(args.api_url, args.api_write_key, store)
    detector = (
        PotholeCandidateDetector(args.candidate_model, args.confidence)
        if args.candidate_model
        else None
    )
    camera = CameraManager()
    last_mode: str | None = None
    last_candidate_check = 0.0
    last_capture_at = 0.0
    started_at = time.monotonic()

    try:
        camera.start()
        print(f"Cloud API: {uploader.api_url}")
        print(f"Local queue: {Path(args.database).resolve()}")

        while True:
            now = time.monotonic()
            if args.max_runtime_seconds and now - started_at >= args.max_runtime_seconds:
                break

            cloud_connected = uploader.is_cloud_connected()
            mode = "CLOUD_CONNECTED" if cloud_connected else "OFFLINE"
            if mode != last_mode:
                print(f"MODE -> {mode}")
                last_mode = mode

            if cloud_connected:
                uploaded = uploader.upload_pending(args.max_upload_batch)
                if uploaded:
                    print(f"Uploaded {uploaded} queued capture(s).")

            should_check_candidate = detector is not None and (
                now - last_candidate_check >= args.candidate_interval
            )
            should_make_demo_capture = args.demo_capture_interval > 0 and (
                now - last_capture_at >= args.demo_capture_interval
            )
            if should_check_candidate or should_make_demo_capture:
                frame_rgb = camera.capture_frame()
                frame_bgr = cv2.cvtColor(frame_rgb, cv2.COLOR_RGB2BGR)
                detections: list[dict[str, Any]] = []
                if should_check_candidate:
                    last_candidate_check = now
                    detections = detector.detect(frame_bgr) if detector else []

                capture_is_due = bool(detections) and (
                    now - last_capture_at >= args.capture_cooldown
                )
                if should_make_demo_capture:
                    capture_is_due = True
                    detections = [{"label": "demo_capture", "confidence": 1.0}]

                if capture_is_due:
                    capture = store.save_capture(
                        frame_bgr,
                        candidate_detections=detections,
                    )
                    last_capture_at = now
                    print(
                        f"Queued capture {capture.capture_id} "
                        f"({len(detections)} candidate detection(s))."
                    )

            time.sleep(max(args.check_interval, 0.1))
    except KeyboardInterrupt:
        print("Stopping dock agent.")
    finally:
        camera.stop()

    print(f"Queue status: {store.counts_by_status()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())