"""Client for posting pothole detection results to the Vercel API."""

from __future__ import annotations

import json
import logging
import os
from typing import Any

import cv2
import numpy as np
import requests

logger = logging.getLogger(__name__)

DEFAULT_API_URL = "https://api-mu-ten-54.vercel.app"

_ENV_LOADED = False


def _load_backend_env() -> None:
    """Load backend/.env into os.environ if present (no python-dotenv required)."""
    global _ENV_LOADED
    if _ENV_LOADED:
        return
    _ENV_LOADED = True
    env_path = os.path.join(os.path.dirname(__file__), ".env")
    if not os.path.isfile(env_path):
        return
    try:
        with open(env_path, encoding="utf-8") as handle:
            for raw in handle:
                line = raw.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, _, value = line.partition("=")
                key = key.strip()
                value = value.strip().strip('"').strip("'")
                if key and key not in os.environ:
                    os.environ[key] = value
    except OSError as exc:
        logger.warning("Could not read backend/.env: %s", exc)


def get_api_url() -> str:
    _load_backend_env()
    return os.getenv("POTHOLE_API_URL", DEFAULT_API_URL).rstrip("/")


def get_write_key() -> str | None:
    _load_backend_env()
    key = os.getenv("POTHOLE_API_WRITE_KEY", "").strip()
    return key or None


def auth_headers() -> dict[str, str]:
    key = get_write_key()
    if not key:
        raise RuntimeError(
            "Missing POTHOLE_API_WRITE_KEY. Set it in your environment "
            "(or backend/.env) before posting reports."
        )
    return {"X-API-Key": key}


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


def post_image_report(
    *,
    original_filename: str,
    original_bytes: bytes,
    annotated_bgr: np.ndarray,
    detections: list[dict[str, Any]],
    api_url: str | None = None,
    latitude: float | None = None,
    longitude: float | None = None,
    notes: str | None = None,
) -> dict[str, Any]:
    """Upload original and annotated images plus detection metadata."""
    base_url = (api_url or get_api_url()).rstrip("/")
    encoded_ok, annotated_buffer = cv2.imencode(".jpg", annotated_bgr)
    if not encoded_ok:
        raise RuntimeError("Failed to encode annotated image.")

    metadata = {
        "detections": detections,
        "detection_count": len(detections),
        "source": "streamlit",
        "models_used": sorted({d.get("model") for d in detections if d.get("model")}),
    }

    form_data: dict[str, str] = {
        "metadata": json.dumps(metadata),
        "status": "pending",
    }

    severity = infer_severity(detections)
    if severity:
        form_data["severity"] = severity
    if latitude is not None:
        form_data["latitude"] = str(latitude)
    if longitude is not None:
        form_data["longitude"] = str(longitude)
    if notes:
        form_data["notes"] = notes[:2000]

    files = {
        "image": (original_filename, original_bytes, "image/jpeg"),
        "annotated_image": (
            f"annotated_{original_filename}",
            annotated_buffer.tobytes(),
            "image/jpeg",
        ),
    }

    response = requests.post(
        f"{base_url}/api/reports",
        data=form_data,
        files=files,
        headers=auth_headers(),
        timeout=120,
    )
    response.raise_for_status()
    return response.json()
