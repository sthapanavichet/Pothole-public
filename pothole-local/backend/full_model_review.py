"""Run the full YOLO model on locally uploaded reports and update the API.

This is intended for the no-Docker LAN setup:

    Pi candidate detector -> local API upload -> this reviewer -> dashboard boxes

The script reads reports from the local API, runs the full YOLOv8m model on each
original uploaded image, saves an annotated image into the local API uploads
folder, and patches the report metadata with `metadata.full_model`.
"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
from typing import Any
from urllib.parse import unquote, urlparse

import cv2
import numpy as np
import requests
from ultralytics import YOLO


DEFAULT_API_URL = "http://192.168.137.1:3000"
DEFAULT_WRITE_KEY = "local-dev-write-key"
DEFAULT_MODEL_PATH = (
    "RoadDetectionModel/RoadModel_yolov8m.pt_rounds120_b9/weights/best.pt"
)


def load_env_file(path: Path) -> None:
    if not path.is_file():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)


def auth_headers(api_write_key: str) -> dict[str, str]:
    return {"X-API-Key": api_write_key}


def read_image(report: dict[str, Any], api_root: Path) -> np.ndarray:
    image_url = report.get("image_url")
    if not image_url:
        raise ValueError("report has no image_url")

    parsed = urlparse(image_url)
    if parsed.path.startswith("/uploads/"):
        local_path = api_root / "public" / "uploads" / unquote(Path(parsed.path).name)
        if local_path.is_file():
            image = cv2.imread(str(local_path))
            if image is None:
                raise ValueError(f"could not decode local image: {local_path}")
            return image

    response = requests.get(image_url, timeout=30)
    response.raise_for_status()
    data = np.frombuffer(response.content, dtype=np.uint8)
    image = cv2.imdecode(data, cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError(f"could not decode image from {image_url}")
    return image


def run_full_model(
    model: YOLO, image_bgr: np.ndarray, confidence: float
) -> tuple[list[dict[str, Any]], np.ndarray]:
    result = model.predict(image_bgr, conf=confidence, verbose=False)[0]
    names = result.names
    annotated = image_bgr.copy()
    detections: list[dict[str, Any]] = []

    if result.boxes is None:
        return detections, annotated

    for box in result.boxes:
        class_id = int(box.cls[0].item())
        label = str(names[class_id])
        conf = float(box.conf[0].item())
        x1, y1, x2, y2 = [float(v) for v in box.xyxy[0].tolist()]
        detections.append(
            {
                "label": label,
                "confidence": round(conf, 4),
                "bbox": [round(x1, 2), round(y1, 2), round(x2, 2), round(y2, 2)],
                "model": "full_yolov8m",
            }
        )

        pt1 = (int(round(x1)), int(round(y1)))
        pt2 = (int(round(x2)), int(round(y2)))
        cv2.rectangle(annotated, pt1, pt2, (0, 0, 255), 3)
        text = f"{label} {conf:.2f}"
        (tw, th), baseline = cv2.getTextSize(
            text, cv2.FONT_HERSHEY_SIMPLEX, 0.7, 2
        )
        text_y = max(pt1[1] - 8, th + baseline + 4)
        cv2.rectangle(
            annotated,
            (pt1[0], text_y - th - baseline - 4),
            (pt1[0] + tw + 8, text_y + baseline),
            (0, 0, 255),
            -1,
        )
        cv2.putText(
            annotated,
            text,
            (pt1[0] + 4, text_y - 4),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.7,
            (255, 255, 255),
            2,
            cv2.LINE_AA,
        )

    return detections, annotated


def infer_severity(detections: list[dict[str, Any]]) -> str | None:
    if not detections:
        return None
    max_conf = max(float(d["confidence"]) for d in detections)
    if max_conf >= 0.85:
        return "critical"
    if max_conf >= 0.7:
        return "high"
    if max_conf >= 0.5:
        return "medium"
    return "low"


def public_upload_url(api_url: str, filename: str) -> str:
    base = os.getenv("LOCAL_PUBLIC_BASE_URL", api_url).rstrip("/")
    return f"{base}/uploads/{filename}"


def process_report(
    *,
    report: dict[str, Any],
    model: YOLO,
    api_url: str,
    api_write_key: str,
    api_root: Path,
    confidence: float,
) -> str:
    report_id = report["id"]
    image = read_image(report, api_root)
    height, width = image.shape[:2]
    detections, annotated = run_full_model(model, image, confidence)

    uploads_dir = api_root / "public" / "uploads"
    uploads_dir.mkdir(parents=True, exist_ok=True)
    annotated_name = f"fullmodel-{report_id}.jpg"
    annotated_path = uploads_dir / annotated_name
    if not cv2.imwrite(str(annotated_path), annotated):
        raise RuntimeError(f"failed to write annotated image: {annotated_path}")

    metadata = dict(report.get("metadata") or {})
    metadata["full_model"] = {
        "model": "RoadModel_yolov8m.pt_rounds120_b9/weights/best.pt",
        "processed_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "confidence_threshold": confidence,
        "image_width": width,
        "image_height": height,
        "detections": detections,
        "detection_count": len(detections),
    }

    patch: dict[str, Any] = {
        "metadata": metadata,
        "annotated_image_url": public_upload_url(api_url, annotated_name),
    }
    severity = infer_severity(detections)
    if severity:
        patch["severity"] = severity

    response = requests.patch(
        f"{api_url.rstrip('/')}/api/reports/{report_id}",
        json=patch,
        headers=auth_headers(api_write_key),
        timeout=60,
    )
    response.raise_for_status()
    return f"{report_id}: {len(detections)} full-model detection(s)"


def parse_args() -> argparse.Namespace:
    here = Path(__file__).resolve().parent
    load_env_file(here / ".env")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--api-url", default=os.getenv("POTHOLE_API_URL", DEFAULT_API_URL)
    )
    parser.add_argument(
        "--api-write-key",
        default=os.getenv("POTHOLE_API_WRITE_KEY", DEFAULT_WRITE_KEY),
    )
    parser.add_argument("--api-root", default=here.parent / "api")
    parser.add_argument("--model-path", default=here / DEFAULT_MODEL_PATH)
    parser.add_argument("--confidence", type=float, default=0.25)
    parser.add_argument("--limit", type=int, default=25)
    parser.add_argument("--force", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    api_url = str(args.api_url).rstrip("/")
    api_root = Path(args.api_root).resolve()
    model_path = Path(args.model_path).resolve()

    if not model_path.is_file():
        raise SystemExit(f"Full model weights not found: {model_path}")

    model = YOLO(str(model_path))
    response = requests.get(f"{api_url}/api/reports", timeout=30)
    response.raise_for_status()
    reports = response.json().get("reports", [])

    processed = 0
    for report in reports:
        metadata = report.get("metadata") or {}
        if not args.force and metadata.get("full_model"):
            continue
        try:
            print(
                process_report(
                    report=report,
                    model=model,
                    api_url=api_url,
                    api_write_key=args.api_write_key,
                    api_root=api_root,
                    confidence=args.confidence,
                )
            )
            processed += 1
        except Exception as exc:
            print(f"{report.get('id')}: skipped ({exc})")
        if processed >= args.limit:
            break

    print(f"Processed {processed} report(s).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
