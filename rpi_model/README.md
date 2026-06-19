# Pi Vision Pipeline

A simple, extensible Raspberry Pi 5 image processing pipeline for the Raspberry Pi Camera Module 2 using `Picamera2`, OpenCV, and a local browser stream.

## Project Structure

```text
pi-vision-pipeline/
├── README.md
├── requirements.txt
├── main.py
├── camera.py
├── processing.py
├── config.py
├── utils.py
├── outputs/
└── systemd/
    └── vision-pipeline.service
```

## Hardware Notes

- Raspberry Pi 5
- Raspberry Pi Camera Module 2 (IMX219)
- Pi 5 compatible camera ribbon cable
- Raspberry Pi OS 64-bit
- Camera connected to the Pi CSI camera connector

Make sure the ribbon cable is fully seated and oriented correctly at both ends before testing software.

## Install

On Raspberry Pi OS, prefer the system packages:

```bash
sudo apt update
sudo apt install -y python3-picamera2 python3-opencv python3-numpy python3-flask
```

Optional: if you want a local Python environment for development:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Verify The Camera

List detected cameras:

```bash
rpicam-hello --list-cameras
```

Capture a test image:

```bash
rpicam-still -o test.jpg
```

If both commands work, the camera stack is likely configured correctly.

## Run

```bash
python3 main.py
```

The application will:

- capture live frames from the CSI camera with `Picamera2`
- convert color format for OpenCV
- generate grayscale, blur, and Canny edges
- overlay FPS on both browser streams
- serve `Camera Feed` and `Edges` over HTTP
- keep running until you stop the Python process

Open the browser dashboard on the Pi or another device on the same network:

```text
http://dih.local:5000/
```

Direct stream URLs:

```text
http://dih.local:5000/stream/original.mjpg
http://dih.local:5000/stream/edges.mjpg
```

## Output Saving

Frame saving is controlled by `SAVE_OUTPUT` in `config.py`. The base implementation includes a simple periodic save placeholder that writes processed frames every 30 frames when enabled.

Default:

```python
SAVE_OUTPUT = False
```

Saved files go to the `outputs/` directory.

## Troubleshooting

### Camera not detected

- Reseat the CSI ribbon cable.
- Confirm you are using a Pi 5 compatible camera ribbon cable.
- Run `rpicam-hello --list-cameras` and verify the IMX219 appears.
- Reboot after physically reconnecting the camera.

### Wrong ribbon cable

- The Pi 5 camera connector differs from older Pi layouts.
- Use the correct cable and verify the contacts face the proper direction.

### Using a charge-only USB cable

- If you are powering or configuring the Pi through a USB connection elsewhere in your setup, a charge-only cable can cause confusing failures.
- Use a proper data-capable cable when needed.

### `cv2.VideoCapture` not working for CSI camera

- This project intentionally uses `Picamera2`.
- `cv2.VideoCapture()` is generally the wrong interface for the Raspberry Pi CSI camera stack on modern Raspberry Pi OS.

### Missing Picamera2

- Install `python3-picamera2` with `apt`.
- If you are in a virtual environment, make sure it can access system packages or install compatible packages explicitly.

### Browser stream does not load

- Confirm the Python process is still running.
- Make sure port `5000` is reachable on your local network.
- Try `http://127.0.0.1:5000/` directly on the Pi first.
- If hostname resolution fails, use the Pi IP address instead of `dih.local`.

### OpenCV windows do not appear

- This project now uses a browser stream instead of `cv2.imshow()`.
- Raspberry Pi OS Lite is a good fit for this version.

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

Important:

- Update the username in `User=pi` if your Pi uses a different account.
- Update `WorkingDirectory` and `ExecStart` paths if your project lives somewhere else.

## Extending Later

The current pipeline is intentionally small and stable. To extend it later:

- replace `process_frame()` in `processing.py`
- add motion detection or color tracking alongside edge detection
- branch the pipeline into multiple outputs
- add object detection after the camera and processing path is stable
