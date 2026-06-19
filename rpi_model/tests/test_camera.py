from __future__ import annotations

import importlib
import sys
import types
import unittest
from unittest import mock

import numpy as np


def _install_picamera2_stub() -> None:
    if "picamera2" in sys.modules:
        return

    module = types.ModuleType("picamera2")

    class _FakePicamera2:
        def __init__(self) -> None:
            self.configured = None
            self.started = False
            self.stopped = False
            self.closed = False

        def create_preview_configuration(self, main):
            return {"main": main}

        def configure(self, config):
            self.configured = config

        def start(self):
            self.started = True

        def capture_array(self):
            return np.zeros((4, 4, 3), dtype=np.uint8)

        def stop(self):
            self.stopped = True

        def close(self):
            self.closed = True

    module.Picamera2 = _FakePicamera2
    sys.modules["picamera2"] = module


_install_picamera2_stub()
camera = importlib.import_module("camera")


class CameraManagerTests(unittest.TestCase):
    def test_capture_frame_requires_start(self) -> None:
        manager = camera.CameraManager()

        with self.assertRaises(RuntimeError):
            manager.capture_frame()

    def test_start_capture_and_stop_cycle(self) -> None:
        manager = camera.CameraManager()

        manager.start()
        frame = manager.capture_frame()
        manager.stop()

        self.assertEqual(frame.shape, (4, 4, 3))
        self.assertFalse(manager._started)
        self.assertIsNone(manager.camera)

    def test_start_wraps_camera_errors(self) -> None:
        with mock.patch("camera.Picamera2", side_effect=RuntimeError("boom")):
            manager = camera.CameraManager()

            with self.assertRaises(RuntimeError) as ctx:
                manager.start()

            self.assertIn("Failed to start camera", str(ctx.exception))

