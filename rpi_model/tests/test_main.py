from __future__ import annotations

import importlib
import json
import sys
import types
import unittest
from unittest import mock

import numpy as np


def _install_picamera2_stub() -> None:
    if "picamera2" in sys.modules:
        return

    module = types.ModuleType("picamera2")
    module.Picamera2 = type("Picamera2", (), {})
    sys.modules["picamera2"] = module


def _install_flask_stub() -> None:
    if "flask" in sys.modules:
        return

    module = types.ModuleType("flask")

    class _StubResponse:
        def __init__(self, data=b"", status_code=200, mimetype=None):
            self.data = data if isinstance(data, bytes) else str(data).encode()
            self.status_code = status_code
            self.mimetype = mimetype

    class _TestClient:
        def __init__(self, app):
            self._app = app

        def get(self, path):
            result = self._app._routes[path]()
            if hasattr(result, "data"):
                return _StubResponse(
                    data=result.data,
                    status_code=getattr(result, "status_code", 200),
                    mimetype=getattr(result, "mimetype", None),
                )
            if isinstance(result, str):
                return _StubResponse(data=result, status_code=200, mimetype="text/html")
            if isinstance(result, bytes):
                return _StubResponse(data=result, status_code=200)
            return _StubResponse(data=json.dumps(result), status_code=200, mimetype="application/json")

    class _Flask:
        def __init__(self, name):
            self.name = name
            self._routes = {}

        def route(self, path, **_kwargs):
            def decorator(func):
                self._routes[path] = func
                return func

            return decorator

        def test_client(self):
            return _TestClient(self)

        def run(self, *args, **kwargs):
            raise RuntimeError("Stub Flask app cannot be run in tests")

    def _jsonify(value):
        return _StubResponse(data=json.dumps(value).encode(), status_code=200, mimetype="application/json")

    module.Flask = _Flask
    module.Response = _StubResponse
    module.jsonify = _jsonify
    sys.modules["flask"] = module


_install_picamera2_stub()
_install_flask_stub()
main = importlib.import_module("main")


class SaveOutputFrameTests(unittest.TestCase):
    def test_save_output_frame_raises_when_imwrite_fails(self) -> None:
        frame = np.zeros((8, 8, 3), dtype=np.uint8)

        with mock.patch("main.cv2.imwrite", return_value=False):
            with self.assertRaises(RuntimeError) as ctx:
                main.save_output_frame("outputs", 3, frame)

        self.assertIn("Failed to write output frame", str(ctx.exception))


class VisionPipelineServerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.server = main.VisionPipelineServer()

    def test_get_frame_bytes_validates_stream_name(self) -> None:
        with self.assertRaises(ValueError):
            self.server.get_frame_bytes("invalid")

    def test_record_detection_event_tracks_positive_counts(self) -> None:
        with mock.patch("main.time.strftime", return_value="12:34:56"):
            self.server._record_detection_event(2, 24.567)
            self.server._record_detection_event(2, 24.567)
            self.server._record_detection_event(0, 24.567)
            self.server._record_detection_event(3, 24.567)

        log = self.server.get_detection_log()

        self.assertEqual(len(log), 2)
        self.assertEqual(log[0]["count"], 3)
        self.assertEqual(log[1]["count"], 2)
        self.assertEqual(log[0]["fps"], 24.57)


class FlaskRouteTests(unittest.TestCase):
    def setUp(self) -> None:
        self.original_pipeline = main.pipeline

    def tearDown(self) -> None:
        main.pipeline = self.original_pipeline

    def test_index_route_returns_dashboard(self) -> None:
        client = main.app.test_client()

        response = client.get("/")

        self.assertEqual(response.status_code, 200)
        self.assertIn(b"Pi Vision Pipeline", response.data)
        self.assertIn(b"/stream/edges.mjpg", response.data)

    def test_detections_json_route_serializes_log(self) -> None:
        fake_pipeline = types.SimpleNamespace(
            get_detection_log=lambda: [
                {"id": 1, "time": "12:34:56", "count": 2, "fps": 29.5, "label": "paper object"}
            ]
        )
        main.pipeline = fake_pipeline
        client = main.app.test_client()

        response = client.get("/detections.json")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(json.loads(response.data), fake_pipeline.get_detection_log())
