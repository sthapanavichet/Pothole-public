from __future__ import annotations

import unittest

import cv2
import numpy as np

import processing


class ProcessFrameTests(unittest.TestCase):
    def test_process_frame_detects_dark_circle_on_light_background(self) -> None:
        frame_rgb = np.full((240, 320, 3), 255, dtype=np.uint8)
        cv2.circle(frame_rgb, (160, 120), 26, (0, 0, 0), -1)

        frame_bgr, detection_view, edges, count = processing.process_frame(frame_rgb)

        self.assertEqual(frame_bgr.shape, frame_rgb.shape)
        self.assertEqual(detection_view.shape, frame_rgb.shape)
        self.assertEqual(edges.shape, frame_rgb.shape[:2])
        self.assertGreaterEqual(count, 1)

    def test_process_frame_rejects_empty_input(self) -> None:
        with self.assertRaises(ValueError):
            processing.process_frame(None)


class DrawStatusTests(unittest.TestCase):
    def test_draw_status_keeps_frame_shape(self) -> None:
        frame = np.zeros((120, 160, 3), dtype=np.uint8)

        result = processing.draw_status(frame.copy(), 12.34, 2)

        self.assertEqual(result.shape, frame.shape)

