# Raspberry Pi Pothole Capture Package

This folder is self-contained for deployment to a Raspberry Pi 5 with a CSI camera. It runs the pothole-capable `YOLOv8_Small_2nd_Model.pt` candidate model locally, stores detected candidate images in a durable SQLite queue, and uploads them to the Vercel API when internet access is available.

```text
camera -> Pi candidate YOLO -> local JPEG + SQLite queue -> Vercel API -> Supabase
```

`OFFLINE` means the Pi cannot reach the cloud API and retains captures locally. `CLOUD_CONNECTED` means the API health endpoint is available and queued images upload automatically.

## Copy To The Pi

Copy this entire directory to `/home/pi/pothole-rpi`. The packaged model is in `models/YOLOv8_Small_2nd_Model.pt`; do not copy or run the old `main.py` paper-circle proof of concept.

Expected deployment layout:

```text
/home/pi/pothole-rpi/
    .env.example
    setup_pi.sh
    run_agent.sh
    camera.py
    candidate_detector.py
    capture_store.py
    dock_agent.py
    requirements.txt
    models/YOLOv8_Small_2nd_Model.pt
    systemd/pothole-cloud-agent.service
```

## First-Time Setup

On the Pi, run:

```bash
cd /home/pi/pothole-rpi
chmod +x setup_pi.sh run_agent.sh
./setup_pi.sh
nano .env
```

Set `POTHOLE_API_WRITE_KEY` in `.env` to the same secret configured as `API_WRITE_KEY` in the Vercel API project. Keep it private. The default `POTHOLE_API_URL` is already the deployed API.

Verify the CSI camera before starting detection:

```bash
rpicam-hello --list-cameras
rpicam-still -o test.jpg
```

## Run

Start the real candidate detector and cloud uploader:

```bash
./run_agent.sh --confidence 0.35 --candidate-interval 2 --capture-cooldown 15
```

For a simple cloud-connection demonstration that saves a frame every five seconds without running YOLO:

```bash
./run_agent.sh --demo-capture-interval 5
```

If the Pi camera is not currently detected, test the upload path with a generated frame:

```bash
./run_agent.sh --demo-capture-interval 5 --synthetic-demo
```

The agent also starts a browser monitor on port `5050` by default:

```text
http://<pi-ip>:5050/
```

For the current local network:

```text
http://192.168.137.137:5050/
```

The monitor shows the latest frame, cloud connection mode, queued/uploaded state,
and recent capture/upload events. Use `--monitor-port 0` to disable it.

The terminal prints `MODE -> OFFLINE` while the cloud API is unreachable and `MODE -> CLOUD_CONNECTED` after it becomes reachable. Queue state is stored in `data/captures.db`, with camera images in `data/captures/`.

## Start At Boot

Create the protected environment file:

```bash
sudo nano /etc/pothole-cloud-agent.env
sudo chmod 600 /etc/pothole-cloud-agent.env
```

Add:

```text
POTHOLE_API_URL=https://api-mu-ten-54.vercel.app
POTHOLE_API_WRITE_KEY=replace-with-your-api-write-key
```

Enable the service:

```bash
sudo cp systemd/pothole-cloud-agent.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now pothole-cloud-agent
sudo systemctl status pothole-cloud-agent
```

## Notes

- This candidate model is approximately 85 MB. It detects road-damage classes including potholes, but it is not a tiny model. Start with a two-second candidate interval and tune it after measuring Pi CPU temperature and frame rate.
- A GPS receiver is not connected yet. Captures include UTC time and `gps_status="unavailable"`; latitude and longitude are saved as null until GPS support is added.
- The Vercel API stores candidate reports and images. It does not currently run a separate full YOLO model after upload.
