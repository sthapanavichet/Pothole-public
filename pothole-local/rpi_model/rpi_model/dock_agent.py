"""Capture pothole candidates offline and upload them to the cloud when connected."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import threading
import time
from typing import Any

import cv2
import numpy as np
import requests
from flask import Flask, Response, jsonify

from camera import CameraManager
from candidate_detector import PotholeCandidateDetector
from capture_store import CaptureStore, PendingCapture


DEFAULT_API_URL = "https://api-mu-ten-54.vercel.app"


class AgentMonitor:
    """Small browser dashboard for seeing agent state and the latest frame."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self.latest_jpeg: bytes | None = None
        self.status: dict[str, Any] = {
            "mode": "STARTING",
            "queued": 0,
            "uploaded": 0,
            "last_capture_id": None,
            "last_error": None,
        }
        self.events: list[dict[str, Any]] = []

    def set_frame(self, frame_bgr: Any) -> None:
        success, buffer = cv2.imencode(
            ".jpg",
            frame_bgr,
            [int(cv2.IMWRITE_JPEG_QUALITY), 80],
        )
        if not success:
            return
        with self._lock:
            self.latest_jpeg = buffer.tobytes()

    def update_status(self, **updates: Any) -> None:
        with self._lock:
            self.status.update(updates)

    def add_event(self, message: str, **fields: Any) -> None:
        event = {
            "time": time.strftime("%H:%M:%S"),
            "message": message,
            **fields,
        }
        with self._lock:
            self.events.insert(0, event)
            del self.events[50:]

    def snapshot(self) -> dict[str, Any]:
        with self._lock:
            return {
                "status": dict(self.status),
                "events": list(self.events),
            }

    def frame_bytes(self) -> bytes | None:
        with self._lock:
            return self.latest_jpeg


monitor = AgentMonitor()


def start_monitor_server(host: str, port: int) -> None:
    """Run a tiny Flask monitor in the background."""
    app = Flask(__name__)

    @app.route("/")
    def index():
        return """
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Pothole Pi Agent</title>
  <style>
    body { margin: 0; font-family: system-ui, sans-serif; background: #0f172a; color: #e5e7eb; }
    header { padding: 16px 20px; background: #111827; border-bottom: 1px solid #374151; }
    main { display: grid; grid-template-columns: minmax(0, 1fr) 360px; gap: 16px; padding: 16px; }
    img { width: 100%; max-height: calc(100vh - 120px); object-fit: contain; background: #020617; border: 1px solid #374151; }
    aside { background: #111827; border: 1px solid #374151; padding: 14px; }
    dt { color: #9ca3af; font-size: 12px; text-transform: uppercase; margin-top: 10px; }
    dd { margin: 2px 0 0; font-size: 16px; }
    li { margin-bottom: 8px; }
    @media (max-width: 900px) { main { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <header>
    <h1>Pothole Pi Agent</h1>
  </header>
  <main>
    <section>
      <img id="frame" src="/frame.jpg" alt="Latest frame">
    </section>
    <aside>
      <h2>Status</h2>
      <dl id="status"></dl>
      <h2>Events</h2>
      <ul id="events"></ul>
    </aside>
  </main>
  <script>
    const frame = document.getElementById("frame");
    const statusEl = document.getElementById("status");
    const eventsEl = document.getElementById("events");

    function refreshFrame() {
      frame.src = "/frame.jpg?ts=" + Date.now();
    }

    async function refreshStatus() {
      const res = await fetch("/status.json", { cache: "no-store" });
      const data = await res.json();
      statusEl.innerHTML = Object.entries(data.status).map(([key, value]) =>
        `<dt>${key}</dt><dd>${value ?? ""}</dd>`
      ).join("");
      eventsEl.innerHTML = data.events.map((event) =>
        `<li><strong>${event.time}</strong> ${event.message}</li>`
      ).join("");
    }

    setInterval(refreshFrame, 1000);
    setInterval(refreshStatus, 1000);
    refreshStatus();
  </script>
</body>
</html>
"""

    @app.route("/frame.jpg")
    def frame_jpg():
        frame = monitor.frame_bytes()
        if frame is None:
            placeholder = np.full((360, 640, 3), 40, dtype=np.uint8)
            cv2.putText(
                placeholder,
                "Waiting for frame",
                (170, 185),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.9,
                (230, 230, 230),
                2,
                cv2.LINE_AA,
            )
            success, buffer = cv2.imencode(".jpg", placeholder)
            frame = buffer.tobytes() if success else b""
        return Response(frame, mimetype="image/jpeg")

    @app.route("/status.json")
    def status_json():
        return jsonify(monitor.snapshot())

    thread = threading.Thread(
        target=lambda: app.run(host=host, port=port, debug=False, use_reloader=False),
        daemon=True,
    )
    thread.start()


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
        "--synthetic-demo",
        action="store_true",
        help="Use generated test frames for demo uploads instead of the Pi camera.",
    )
    parser.add_argument("--monitor-host", default="0.0.0.0")
    parser.add_argument("--monitor-port", type=int, default=5050)
    parser.add_argument(
        "--max-runtime-seconds",
        type=float,
        default=0.0,
        help="Stop after this duration. Zero means run continuously.",
    )
    return parser.parse_args()


def make_synthetic_demo_frame() -> Any:
    """Create a small generated frame so upload flow can be tested without a camera."""
    frame = np.full((480, 640, 3), 245, dtype=np.uint8)
    cv2.rectangle(frame, (0, 0), (639, 479), (40, 40, 40), 4)
    cv2.putText(
        frame,
        "Synthetic pothole demo",
        (40, 70),
        cv2.FONT_HERSHEY_SIMPLEX,
        1.0,
        (20, 20, 20),
        2,
        cv2.LINE_AA,
    )
    cv2.circle(frame, (320, 260), 70, (35, 35, 35), -1)
    cv2.circle(frame, (320, 260), 70, (0, 0, 0), 3)
    return frame


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
    camera = None if args.synthetic_demo else CameraManager()
    last_mode: str | None = None
    last_candidate_check = 0.0
    last_capture_at = 0.0
    started_at = time.monotonic()

    try:
        if args.monitor_port > 0:
            start_monitor_server(args.monitor_host, args.monitor_port)
            print(f"Monitor: http://<pi-ip>:{args.monitor_port}/")

        if camera is not None:
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
                monitor.update_status(mode=mode)
                monitor.add_event(f"Mode changed to {mode}")
                last_mode = mode

            if cloud_connected:
                uploaded = uploader.upload_pending(args.max_upload_batch)
                if uploaded:
                    print(f"Uploaded {uploaded} queued capture(s).")
                    monitor.add_event(f"Uploaded {uploaded} queued capture(s).")

            should_check_candidate = detector is not None and (
                now - last_candidate_check >= args.candidate_interval
            )
            should_make_demo_capture = args.demo_capture_interval > 0 and (
                now - last_capture_at >= args.demo_capture_interval
            )
            if should_check_candidate or should_make_demo_capture:
                if args.synthetic_demo:
                    frame_bgr = make_synthetic_demo_frame()
                else:
                    if camera is None:
                        raise RuntimeError("Camera is unavailable.")
                    frame_rgb = camera.capture_frame()
                    frame_bgr = cv2.cvtColor(frame_rgb, cv2.COLOR_RGB2BGR)
                monitor.set_frame(frame_bgr)
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
                    monitor.update_status(last_capture_id=capture.capture_id)
                    monitor.add_event(
                        f"Queued capture {capture.capture_id}",
                        detections=len(detections),
                    )

            time.sleep(max(args.check_interval, 0.1))
    except KeyboardInterrupt:
        print("Stopping dock agent.")
        monitor.add_event("Stopping dock agent.")
    finally:
        if camera is not None:
            camera.stop()

    queue_status = store.counts_by_status()
    monitor.update_status(**queue_status)
    print(f"Queue status: {queue_status}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
