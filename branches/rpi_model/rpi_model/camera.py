"""Camera management for Raspberry Pi CSI cameras using Picamera2."""

from __future__ import annotations

from picamera2 import Picamera2

from config import FRAME_FORMAT, HEIGHT, WIDTH


class CameraManager:
    """Configure, start, read from, and stop the Pi camera safely."""

    def __init__(self) -> None:
        self.camera = None
        self._started = False

    def start(self) -> None:
        """Initialize and start the camera preview configuration."""
        if self._started:
            return

        try:
            self.camera = Picamera2()
            config = self.camera.create_preview_configuration(
                main={"size": (WIDTH, HEIGHT), "format": FRAME_FORMAT}
            )
            self.camera.configure(config)
            self.camera.start()
            self._started = True
        except Exception as exc:
            self.stop()
            raise RuntimeError(f"Failed to start camera: {exc}") from exc

    def capture_frame(self):
        """Capture a single frame as a NumPy array."""
        if not self._started or self.camera is None:
            raise RuntimeError("Camera has not been started.")

        try:
            frame = self.camera.capture_array()
        except Exception as exc:
            raise RuntimeError(f"Failed to capture frame: {exc}") from exc

        if frame is None:
            raise RuntimeError("Camera returned an empty frame.")

        return frame

    def stop(self) -> None:
        """Stop the camera and release resources."""
        if self.camera is not None:
            try:
                if self._started:
                    self.camera.stop()
            except Exception:
                pass
            finally:
                try:
                    self.camera.close()
                except Exception:
                    pass

        self.camera = None
        self._started = False
