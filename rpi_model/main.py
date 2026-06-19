"""Headless browser-streaming entry point for the Raspberry Pi vision pipeline."""

from __future__ import annotations

from collections import deque
import os
import signal
import sys
import threading
import time

import cv2
from flask import Flask, Response, jsonify

from camera import CameraManager
from config import (
    DETECTION_LOG_LIMIT,
    JPEG_QUALITY,
    OUTPUT_DIR,
    SAVE_INTERVAL,
    SAVE_OUTPUT,
    STREAM_HOST,
    STREAM_PORT,
)
from processing import process_frame
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
        self.latest_detection_count = 0
        self.detection_log = deque(maxlen=DETECTION_LOG_LIMIT)

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

                original_jpeg = self._encode_jpeg(frame_bgr)
                edges_jpeg = self._encode_jpeg(detection_view)

                with self.lock:
                    self.latest_original_jpeg = original_jpeg
                    self.latest_edges_jpeg = edges_jpeg
                    self._record_detection_event(count, fps)

                self.frame_ready.set()

                if SAVE_OUTPUT and self.frame_index % SAVE_INTERVAL == 0:
                    save_output_frame(OUTPUT_DIR, self.frame_index, detection_view)

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

    def _record_detection_event(self, count, fps) -> None:
        """Log a detection when the positive object count changes."""
        if count <= 0:
            self.latest_detection_count = 0
            return

        if count == self.latest_detection_count:
            return

        self.latest_detection_count = count
        self.detection_log.appendleft(
            {
                "id": self.frame_index,
                "time": time.strftime("%H:%M:%S"),
                "count": count,
                "fps": round(fps, 2),
                "label": "paper object",
            }
        )

    def get_detection_log(self):
        """Return recent detections for the dashboard."""
        with self.lock:
            return list(self.detection_log)


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
    body {
      background: white;
      color: black;
      font-family: Arial, Helvetica, sans-serif;
      margin: 20px;
    }
    h1 {
      font-size: 28px;
      margin: 0 0 16px;
    }
    h2 {
      font-size: 20px;
      margin: 24px 0 10px;
    }
    img {
      border: 1px solid black;
      display: block;
      max-width: 900px;
      width: 100%;
    }
    .log-count {
      font-size: 14px;
      margin-bottom: 8px;
    }
    table {
      border-collapse: collapse;
      max-width: 900px;
      width: 100%;
    }
    th,
    td {
      border: 1px solid black;
      padding: 6px 8px;
      text-align: left;
    }
    th {
      background: #eeeeee;
    }
    .numeric {
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    .empty-row {
      text-align: center;
    }
  </style>
</head>
<body>
  <h1>Pi Vision Pipeline</h1>

  <h2>Detection Feed</h2>
  <img src="/stream/edges.mjpg" alt="Live detection feed">

  <h2>Reported Detections</h2>
  <div class="log-count" id="log-count">0 events</div>
  <table>
    <thead>
      <tr>
        <th>Time</th>
        <th>Detected Item</th>
        <th>Count</th>
      </tr>
    </thead>
    <tbody id="detection-log">
      <tr>
        <td class="empty-row" colspan="3">Waiting for detected objects...</td>
      </tr>
    </tbody>
  </table>
  <script>
    const logElement = document.getElementById("detection-log");
    const logCountElement = document.getElementById("log-count");

    function formatDetectedItem(event) {
      return event.count === 1 ? event.label : `${event.label}s`;
    }

    function renderDetectionLog(events) {
      logCountElement.textContent = `${events.length} ${events.length === 1 ? "event" : "events"}`;

      if (!events.length) {
        logElement.innerHTML = '<tr><td class="empty-row" colspan="3">Waiting for detected objects...</td></tr>';
        return;
      }

      logElement.innerHTML = events.map((event) => `
        <tr>
          <td class="numeric">${event.time}</td>
          <td>${formatDetectedItem(event)}</td>
          <td class="numeric">${event.count}</td>
        </tr>
      `).join("");
    }

    async function refreshDetectionLog() {
      try {
        const response = await fetch("/detections.json", { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`Request failed: ${response.status}`);
        }
        const events = await response.json();
        renderDetectionLog(events);
      } catch (error) {
        logElement.innerHTML = '<tr><td class="empty-row" colspan="3">Detection log unavailable.</td></tr>';
      }
    }

    refreshDetectionLog();
    setInterval(refreshDetectionLog, 1000);
  </script>
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


@app.route("/detections.json")
def detections_json():
    """Serve recent detection events for the dashboard log."""
    return jsonify(pipeline.get_detection_log())


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
