"""Frame processing functions for the vision pipeline."""

from __future__ import annotations

import cv2
import math

from config import (
    BLUR_KERNEL,
    CANNY_HIGH,
    CANNY_LOW,
    CIRCLE_BINARY_THRESHOLD,
    CIRCLE_MAX_AREA,
    CIRCLE_MIN_AREA,
    CIRCLE_MIN_CIRCULARITY,
    CIRCLE_MIN_RADIUS,
)


def process_frame(frame_rgb):
    """Convert a camera frame into display-ready views and circle detections."""
    if frame_rgb is None:
        raise ValueError("Input frame is empty.")

    frame_bgr = cv2.cvtColor(frame_rgb, cv2.COLOR_RGB2BGR)
    gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, BLUR_KERNEL, 0)
    edges = cv2.Canny(blurred, CANNY_LOW, CANNY_HIGH)
    _, thresholded = cv2.threshold(
        blurred,
        CIRCLE_BINARY_THRESHOLD,
        255,
        cv2.THRESH_BINARY_INV,
    )
    thresholded = cv2.morphologyEx(
        thresholded,
        cv2.MORPH_OPEN,
        cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)),
    )
    contours, _ = cv2.findContours(
        thresholded,
        cv2.RETR_EXTERNAL,
        cv2.CHAIN_APPROX_SIMPLE,
    )

    detection_view = frame_bgr.copy()
    count = 0

    for contour in contours:
        area = cv2.contourArea(contour)
        if area < CIRCLE_MIN_AREA or area > CIRCLE_MAX_AREA:
            continue

        perimeter = cv2.arcLength(contour, True)
        if perimeter <= 0:
            continue

        circularity = 4.0 * math.pi * area / (perimeter * perimeter)
        if circularity < CIRCLE_MIN_CIRCULARITY:
            continue

        (x, y), radius = cv2.minEnclosingCircle(contour)
        if radius < CIRCLE_MIN_RADIUS:
            continue

        count += 1
        center = (int(x), int(y))
        radius_int = int(radius)
        cv2.circle(detection_view, center, radius_int, (0, 255, 0), 2)
        cv2.circle(detection_view, center, 3, (0, 255, 255), -1)
        cv2.putText(
            detection_view,
            str(count),
            (center[0] - 10, center[1] - radius_int - 8),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.6,
            (0, 255, 0),
            2,
            cv2.LINE_AA,
        )

    return frame_bgr, detection_view, edges, count


def draw_status(frame, fps, count: int | None = None):
    """Overlay FPS text and optional detection count on a frame for display."""
    cv2.putText(
        frame,
        f"FPS: {fps:.2f}",
        (10, 30),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.8,
        (0, 255, 0),
        2,
        cv2.LINE_AA,
    )

    if count is not None:
        cv2.putText(
            frame,
            f"Count: {count}",
            (10, 62),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.8,
            (0, 255, 255),
            2,
            cv2.LINE_AA,
        )

    return frame
