# Raspberry Pi Object Detection Proof of Concept

This folder contains a lightweight Raspberry Pi vision pipeline for detecting objects on paper. The goal is to prove that a small, local model-style pipeline can support the app concept without needing a large cloud model or heavy hardware.

This direction was suggested by Jacky during our meeting: start with a simple object-detection proof of concept on paper, then use that result as the foundation for the full app workflow. The current implementation detects dark circular objects on a light paper background, counts them, outlines them, and streams the result to a browser.

## What It Does

The pipeline runs on a Raspberry Pi with a CSI camera. It:

- captures live frames from the Raspberry Pi camera
- converts each frame into an OpenCV image
- blurs and thresholds the image to isolate dark objects on light paper
- finds contours and filters them by area, radius, and circularity
- draws circles and labels around detected objects
- displays the current detection count and FPS
- streams the live camera feed and detection view through a small Flask web server
- optionally saves processed output frames for review

This is intentionally small and readable. It is not the final production model, but it gives the team a working proof of concept for local object detection that can later be extended or replaced with a trained model.

## Folder Contents

```text
rpi_model/
|-- README.md
|-- requirements.txt
|-- main.py
|-- camera.py
|-- processing.py
|-- config.py
|-- utils.py
|-- outputs/
|   `-- .gitkeep
`-- systemd/
    `-- vision-pipeline.service
```

## File Overview

- `main.py` starts the camera, runs the processing loop, and serves the browser dashboard.
- `camera.py` wraps `Picamera2` setup, frame capture, and shutdown.
- `processing.py` contains the object-detection logic using OpenCV thresholding, contours, and circularity checks.
- `config.py` stores camera size, detection thresholds, stream settings, and output-saving options.
- `utils.py` contains small helper functions such as FPS calculation and output directory creation.
- `requirements.txt` lists the Python dependencies used by the pipeline.
- `outputs/` is reserved for saved detection frames when output saving is enabled.
- `systemd/vision-pipeline.service` is a sample service file for running the pipeline automatically on a Raspberry Pi.

## Hardware Notes

Expected setup:

- Raspberry Pi 5
- Raspberry Pi Camera Module 2, IMX219
- Pi 5 compatible camera ribbon cable
- Raspberry Pi OS 64-bit
- Camera connected to the Pi CSI camera connector
- Paper target with dark circular objects for the proof-of-concept detection test

Make sure the ribbon cable is fully seated and oriented correctly at both ends before testing the software.

## Install

On Raspberry Pi OS, prefer system packages for camera and OpenCV support:

```bash
sudo apt update
sudo apt install -y python3-picamera2 python3-opencv python3-numpy python3-flask
```

Optional local environment for development:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Testing

Run the automated test suite from inside the `rpi_model/` folder:

```bash
python -m unittest discover -s tests -p "test_*.py" -v
```

The suite includes:

- unit tests for helpers in `utils.py`
- processing tests for `processing.py`
- camera wrapper tests with a mocked `Picamera2`
- Flask route tests for the lightweight API in `main.py`

GitHub Actions runs the same command automatically on push and pull request through `.github/workflows/python-tests.yml`.

## Verify The Camera

List detected cameras:

```bash
rpicam-hello --list-cameras
```

Capture a test image:

```bash
rpicam-still -o test.jpg
```

If both commands work, the Raspberry Pi camera stack is likely configured correctly.

## Run

From inside the `rpi_model/` folder:

```bash
python3 main.py
```

The app starts a browser dashboard at:

```text
http://127.0.0.1:5000/
```

From another device on the same network, replace the host with the Pi hostname or IP address:

```text
http://<pi-hostname>.local:5000/
http://<pi-ip-address>:5000/
```

Direct stream URLs:

```text
http://<pi-hostname>.local:5000/stream/original.mjpg
http://<pi-hostname>.local:5000/stream/edges.mjpg
```

## Detection Logic

The proof-of-concept detector in `processing.py` follows this basic flow:

1. Convert the camera frame from RGB to BGR for OpenCV.
2. Convert the frame to grayscale.
3. Apply a Gaussian blur to reduce noise.
4. Threshold the image so dark objects on paper become foreground objects.
5. Clean the thresholded image with a morphological open operation.
6. Find contours.
7. Filter contours by minimum area, maximum area, circularity, and radius.
8. Draw the accepted detections and update the object count.

The thresholds are in `config.py`, so the detection behavior can be tuned without changing the main code.

## Output Saving

Frame saving is controlled by `SAVE_OUTPUT` in `config.py`.

Default:

```python
SAVE_OUTPUT = False
```

When enabled, processed frames are saved into `outputs/` at the configured `SAVE_INTERVAL`.

## systemd Setup

The repository includes a sample service file at `systemd/vision-pipeline.service`.

Copy it into place:

```bash
sudo cp systemd/vision-pipeline.service /etc/systemd/system/vision-pipeline.service
```

Reload systemd and enable the service:

```bash
sudo systemctl daemon-reload
sudo systemctl enable vision-pipeline.service
sudo systemctl start vision-pipeline.service
```

Check status:

```bash
sudo systemctl status vision-pipeline.service
```

Update the username, `WorkingDirectory`, and `ExecStart` values in the service file if the project path or Pi account is different.

## Next Steps

This folder is a proof of concept for the app. Good next steps are:

- test with different paper layouts and lighting conditions
- tune the values in `config.py`
- save example detection outputs for documentation
- connect the detection result to the main app workflow
- replace or augment the OpenCV contour logic with a trained lightweight model when the target object set is finalized
