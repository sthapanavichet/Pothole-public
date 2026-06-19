"""Utility helpers for the vision pipeline."""

from __future__ import annotations

import os
import time


def calculate_fps(prev_time):
    """Return the current FPS and the current timestamp."""
    current_time = time.time()
    elapsed = current_time - prev_time
    fps = 0.0 if elapsed <= 0 else 1.0 / elapsed
    return fps, current_time


def ensure_output_dir(path):
    """Create the output directory if it does not already exist."""
    os.makedirs(path, exist_ok=True)
