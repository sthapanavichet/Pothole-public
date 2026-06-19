"""Headless browser-streaming entry point for the Raspberry Pi vision pipeline."""

from __future__ import annotations

import os
import signal
import sys
import threading
import time

import cv2
from flask import Flask, Response

from camera import CameraManager
from config import JPEG_QUALITY, OUTPUT_DIR, SAVE_INTERVAL, SAVE_OUTPUT, STREAM_HOST, STREAM_PORT
from processing import draw_status, process_frame
from utils import calculate_fps, ensure_output_dir

app = Flask(__name__)


def save_output_frame(output_dir, frame_index, frame):
    """Save a frame to disk using a simple periodic naming scheme."""
    filename = os.path.join(output_dir, f"detections_{frame_index:06d}.png")
    if not cv2.imwrite(filename, frame):
        raise RuntimeError(f"Failed to write output frame: {filename}")


class VisionPipelineServer:
    """Capture, process, and publish the latest frames for HTTP streaming."""

    def __init__(self) -> None:
        self.camera = CameraManager()
        self.prev_time = time.time()
        self.frame_index = 0
        self.stop_event = threading.Event()
        self.frame_ready = threading.Event()
        self.lock = threading.Lock()
        self.capture_thread = None
        self.latest_original_jpeg = None
        self.latest_edges_jpeg = None

    def start(self) -> None:
        """Start the camera and the background capture loop."""
        if SAVE_OUTPUT:
            ensure_output_dir(OUTPUT_DIR)

        self.camera.start()
        self.capture_thread = threading.Thread(target=self._capture_loop, daemon=True)
        self.capture_thread.start()

    def stop(self) -> None:
        """Stop the background loop and release the camera."""
        self.stop_event.set()

        if self.capture_thread is not None and self.capture_thread.is_alive():
            self.capture_thread.join(timeout=2.0)

        self.camera.stop()

    def _capture_loop(self) -> None:
        """Capture and process frames continuously for the streaming endpoints."""
        while not self.stop_event.is_set():
            try:
                frame_rgb = self.camera.capture_frame()
                frame_bgr, detection_view, edges, count = process_frame(frame_rgb)

                fps, self.prev_time = calculate_fps(self.prev_time)
                display_frame = draw_status(frame_bgr.copy(), fps, count)
                detection_display = draw_status(detection_view, fps, count)

                original_jpeg = self._encode_jpeg(display_frame)
                edges_jpeg = self._encode_jpeg(detection_display)

                with self.lock:
                    self.latest_original_jpeg = original_jpeg
                    self.latest_edges_jpeg = edges_jpeg

                self.frame_ready.set()

                if SAVE_OUTPUT and self.frame_index % SAVE_INTERVAL == 0:
                    save_output_frame(OUTPUT_DIR, self.frame_index, detection_display)

                self.frame_index += 1
            except Exception as exc:
                print(f"Capture loop error: {exc}", file=sys.stderr)
                self.stop_event.set()
                break

    def _encode_jpeg(self, frame):
        """Encode a frame as JPEG bytes for browser streaming."""
        success, buffer = cv2.imencode(
            ".jpg",
            frame,
            [int(cv2.IMWRITE_JPEG_QUALITY), JPEG_QUALITY],
        )
        if not success:
            raise RuntimeError("Failed to encode frame as JPEG.")
        return buffer.tobytes()

    def get_frame_bytes(self, stream_name):
        """Fetch the latest JPEG frame for a named stream."""
        with self.lock:
            if stream_name == "original":
                return self.latest_original_jpeg
            if stream_name == "edges":
                return self.latest_edges_jpeg
        raise ValueError(f"Unknown stream name: {stream_name}")


pipeline = VisionPipelineServer()


def generate_stream(stream_name):
    """Yield multipart JPEG chunks for the requested stream."""
    while not pipeline.stop_event.is_set():
        if not pipeline.frame_ready.wait(timeout=5.0):
            continue

        frame_bytes = pipeline.get_frame_bytes(stream_name)
        if frame_bytes is None:
            continue

        yield (
            b"--frame\r\n"
            b"Content-Type: image/jpeg\r\n\r\n" + frame_bytes + b"\r\n"
        )


@app.route("/")
def index():
    """Serve a minimal dashboard for the live streams."""
    return """
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Pi Vision Pipeline</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #0f172a;
      --panel: #111827;
      --border: #334155;
      --text: #e5e7eb;
      --accent: #22c55e;
    }
    body {
      margin: 0;
      font-family: "Segoe UI", sans-serif;
      background: radial-gradient(circle at top, #1e293b, var(--bg));
      color: var(--text);
    }
    main {
      max-width: 1200px;
      margin: 0 auto;
      padding: 24px;
    }
    h1 {
      margin-bottom: 8px;
    }
    p {
      color: #cbd5e1;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      gap: 20px;
      margin-top: 24px;
    }
    .panel {
      background: rgba(17, 24, 39, 0.9);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 16px;
      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.25);
    }
    img {
      width: 100%;
      border-radius: 12px;
      display: block;
      background: black;
    }
    .tag {
      display: inline-block;
      margin-top: 8px;
      padding: 6px 10px;
      border-radius: 999px;
      background: rgba(34, 197, 94, 0.12);
      color: #86efac;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <main>
    <h1>Pi Vision Pipeline</h1>
    <p>The Raspberry Pi detects dark circular markers on light paper and overlays a live object count in real time.</p>
    <div class="grid">
      <section class="panel">
        <h2>Camera Feed</h2>
        <img src="/stream/original.mjpg" alt="Processed camera feed">
        <div class="tag">Live camera stream with FPS and circle count</div>
      </section>
      <section class="panel">
        <h2>Detections</h2>
        <img src="/stream/edges.mjpg" alt="Canny edge stream">
        <div class="tag">Dark circular blobs outlined and counted</div>
      </section>
    </div>
  </main>
</body>
</html>
"""


@app.route("/stream/original.mjpg")
def stream_original():
    """Serve the processed color stream."""
    return Response(
        generate_stream("original"),
        mimetype="multipart/x-mixed-replace; boundary=frame",
    )


@app.route("/stream/edges.mjpg")
def stream_edges():
    """Serve the circle-detection stream."""
    return Response(
        generate_stream("edges"),
        mimetype="multipart/x-mixed-replace; boundary=frame",
    )


def _handle_shutdown(signum, _frame):
    """Stop background resources before exiting."""
    print(f"Received signal {signum}. Shutting down.")
    pipeline.stop()
    raise SystemExit(0)


def main():
    """Run the live capture pipeline and HTTP server."""
    signal.signal(signal.SIGINT, _handle_shutdown)
    signal.signal(signal.SIGTERM, _handle_shutdown)

    try:
        pipeline.start()
        print(f"Stream available at http://127.0.0.1:{STREAM_PORT}/")
        print(f"Stream available on your network at http://<pi-hostname>.local:{STREAM_PORT}/")
        app.run(host=STREAM_HOST, port=STREAM_PORT, threaded=True, debug=False, use_reloader=False)
    except KeyboardInterrupt:
        print("\nInterrupted by user.")
    except Exception as exc:
        print(f"Pipeline error: {exc}", file=sys.stderr)
        return 1
    finally:
        pipeline.stop()
        print("Camera stopped. Streaming server closed.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
