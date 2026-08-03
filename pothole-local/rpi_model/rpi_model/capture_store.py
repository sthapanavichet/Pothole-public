"""Persistent capture queue for the Raspberry Pi cloud-upload workflow."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import sqlite3
from typing import Any
from uuid import uuid4

import cv2


@dataclass(frozen=True)
class PendingCapture:
    """A locally stored image awaiting delivery to the cloud API."""

    capture_id: str
    captured_at: str
    image_path: Path
    image_sha256: str
    latitude: float | None
    longitude: float | None
    gps_status: str
    candidate_detections: list[dict[str, Any]]
    upload_attempts: int


class CaptureStore:
    """Store captures on disk and keep reliable upload state in SQLite."""

    def __init__(self, database_path: str | Path, image_dir: str | Path) -> None:
        self.database_path = Path(database_path)
        self.image_dir = Path(image_dir)
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        self.image_dir.mkdir(parents=True, exist_ok=True)
        self._initialize()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.database_path)
        connection.row_factory = sqlite3.Row
        return connection

    def _initialize(self) -> None:
        with self._connect() as connection:
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS captures (
                    capture_id TEXT PRIMARY KEY,
                    captured_at TEXT NOT NULL,
                    image_path TEXT NOT NULL,
                    image_sha256 TEXT NOT NULL,
                    latitude REAL,
                    longitude REAL,
                    gps_status TEXT NOT NULL,
                    candidate_detections TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'pending',
                    upload_attempts INTEGER NOT NULL DEFAULT 0,
                    last_error TEXT,
                    uploaded_at TEXT,
                    server_response TEXT
                )
                """
            )
            connection.execute(
                "CREATE INDEX IF NOT EXISTS captures_pending_idx "
                "ON captures(status, captured_at)"
            )

    def save_capture(
        self,
        frame_bgr: Any,
        *,
        candidate_detections: list[dict[str, Any]],
        latitude: float | None = None,
        longitude: float | None = None,
        gps_status: str = "unavailable",
        captured_at: str | None = None,
    ) -> PendingCapture:
        """Write a JPEG and its metadata atomically enough for queue recovery."""
        timestamp = captured_at or datetime.now(timezone.utc).isoformat().replace(
            "+00:00", "Z"
        )
        capture_id = str(uuid4())
        image_path = self.image_dir / f"{capture_id}.jpg"
        temporary_path = image_path.with_suffix(".tmp.jpg")

        if not cv2.imwrite(str(temporary_path), frame_bgr):
            raise RuntimeError(f"Unable to save capture image: {image_path}")
        temporary_path.replace(image_path)

        image_sha256 = hashlib.sha256(image_path.read_bytes()).hexdigest()
        detections_json = json.dumps(candidate_detections, separators=(",", ":"))

        try:
            with self._connect() as connection:
                connection.execute(
                    """
                    INSERT INTO captures (
                        capture_id, captured_at, image_path, image_sha256,
                        latitude, longitude, gps_status, candidate_detections
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        capture_id,
                        timestamp,
                        str(image_path),
                        image_sha256,
                        latitude,
                        longitude,
                        gps_status,
                        detections_json,
                    ),
                )
        except Exception:
            image_path.unlink(missing_ok=True)
            raise

        return PendingCapture(
            capture_id=capture_id,
            captured_at=timestamp,
            image_path=image_path,
            image_sha256=image_sha256,
            latitude=latitude,
            longitude=longitude,
            gps_status=gps_status,
            candidate_detections=candidate_detections,
            upload_attempts=0,
        )

    def pending_captures(self, limit: int = 10) -> list[PendingCapture]:
        """Return captures that have not been acknowledged by the server."""
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT * FROM captures
                WHERE status = 'pending'
                ORDER BY captured_at ASC
                LIMIT ?
                """,
                (limit,),
            ).fetchall()

        return [
            PendingCapture(
                capture_id=row["capture_id"],
                captured_at=row["captured_at"],
                image_path=Path(row["image_path"]),
                image_sha256=row["image_sha256"],
                latitude=row["latitude"],
                longitude=row["longitude"],
                gps_status=row["gps_status"],
                candidate_detections=json.loads(row["candidate_detections"]),
                upload_attempts=row["upload_attempts"],
            )
            for row in rows
        ]

    def mark_uploaded(self, capture_id: str, response: dict[str, Any]) -> None:
        """Mark a capture delivered only after the cloud API acknowledges it."""
        with self._connect() as connection:
            connection.execute(
                """
                UPDATE captures
                SET status = 'uploaded', uploaded_at = ?, last_error = NULL,
                    server_response = ?
                WHERE capture_id = ?
                """,
                (
                    datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                    json.dumps(response, separators=(",", ":")),
                    capture_id,
                ),
            )

    def mark_upload_failed(self, capture_id: str, error: str) -> None:
        """Keep a failed capture pending so a later dock attempt retries it."""
        with self._connect() as connection:
            connection.execute(
                """
                UPDATE captures
                SET upload_attempts = upload_attempts + 1, last_error = ?
                WHERE capture_id = ?
                """,
                (error[:1000], capture_id),
            )

    def counts_by_status(self) -> dict[str, int]:
        """Return queue counts for terminal status output."""
        with self._connect() as connection:
            rows = connection.execute(
                "SELECT status, COUNT(*) AS count FROM captures GROUP BY status"
            ).fetchall()
        return {row["status"]: row["count"] for row in rows}