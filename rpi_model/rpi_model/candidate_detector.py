"""Small YOLO adapter used by the Pi to decide which frames to retain."""

from __future__ import annotations

from pathlib import Path
from typing import Any


class PotholeCandidateDetector:
    """Detect pothole candidates without making the final reporting decision."""

    def __init__(self, model_path: str | Path, confidence: float = 0.35) -> None:
        from ultralytics import YOLO

        path = Path(model_path)
        if not path.is_file():
            raise FileNotFoundError(
                f"Pi candidate model was not found: {path}. "
                "Copy a pothole-capable YOLO weight file to this path first."
            )
        self.model = YOLO(str(path))
        self.confidence = confidence

    def detect(self, frame_bgr: Any) -> list[dict[str, Any]]:
        """Return only pothole-labelled detections in a portable JSON shape."""
        result = self.model.predict(frame_bgr, conf=self.confidence, verbose=False)[0]
        boxes = result.boxes
        if boxes is None:
            return []

        names = result.names
        detections: list[dict[str, Any]] = []
        for box in boxes:
            class_id = int(box.cls[0].item())
            label = str(names[class_id])
            if "pothole" not in label.lower():
                continue

            x1, y1, x2, y2 = [round(float(value), 2) for value in box.xyxy[0].tolist()]
            detections.append(
                {
                    "label": label,
                    "confidence": round(float(box.conf[0].item()), 4),
                    "bbox": [x1, y1, x2, y2],
                    "model": "pi_candidate",
                }
            )
        return detections