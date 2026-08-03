# Raspberry Pi Cloud Upload Workflow

The Raspberry Pi uploads directly to the existing Vercel API. There is no local dock server and no Windows/Linux machine required for uploads.

| State | Condition | Pi behavior |
| --- | --- | --- |
| `OFFLINE` | `GET /api/health` on the cloud API fails | Save candidate JPEGs and metadata in the local SQLite queue. |
| `CLOUD_CONNECTED` | `GET /api/health` returns `service: pothole-api` | Upload queued images directly to `POST /api/reports`. |

For this design, physical docking must give the Pi access to the internet, such as a dock Ethernet connection or dock Wi-Fi. The agent prints a state change immediately after its next connection check:

```text
MODE -> OFFLINE
MODE -> CLOUD_CONNECTED
```

## 1. Deploy And Configure The Cloud API

Deploy [api](api) to Vercel if it is not already deployed. The current production default is `https://api-mu-ten-54.vercel.app`.

In the Vercel project settings, create an environment variable named `API_WRITE_KEY` with a long random value, then redeploy. The Pi needs this same value to create reports through the existing authenticated API.

The cloud API stores the original image in Supabase Storage and creates a `pothole_reports` row. A capture ID is included in metadata; retrying a previously acknowledged capture returns the original report rather than adding a duplicate.

## 2. Install The Pi Software

Copy the entire [rpi_model/rpi_model](rpi_model/rpi_model) folder to `/home/pi/pothole-rpi`.

For real capture triggering, copy [YOLOv8_Small_2nd_Model.pt](backend/YOLOv8_Small_2nd_Model.pt) to:

```text
/home/pi/pothole-rpi/models/YOLOv8_Small_2nd_Model.pt
```

On Raspberry Pi OS:

```bash
sudo apt update
sudo apt install -y python3-picamera2 python3-opencv python3-numpy python3-venv
cd /home/pi/pothole-rpi
python3 -m venv --system-site-packages .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Set the cloud URL and API write key on the Pi. The URL is already the default, but setting it explicitly makes the configuration clear.

```bash
export POTHOLE_API_URL="https://api-mu-ten-54.vercel.app"
export POTHOLE_API_WRITE_KEY="your-api-write-key"
```

There is no GPS receiver yet. Every local capture has a UTC `captured_at`, `latitude=null`, `longitude=null`, and `gps_status="unavailable"`. A future GPS reader can populate these fields before it calls `save_capture()`.

## 3. Demonstrate Offline Then Cloud Connected

Disconnect the Pi from the internet, then run:

```bash
cd /home/pi/pothole-rpi
source .venv/bin/activate
python dock_agent.py --demo-capture-interval 5
```

Expected output:

```text
MODE -> OFFLINE
Queued capture <uuid> (1 candidate detection(s)).
```

The test frames accumulate in `data/captures/` and their durable queue state is in `data/captures.db`.

Connect the Pi to the dock Ethernet/Wi-Fi network with internet access. Within the default two-second check interval, it prints:

```text
MODE -> CLOUD_CONNECTED
Uploaded <n> queued capture(s).
```

The demo intentionally creates report records from camera frames so that the cloud upload can be verified end to end. Remove those test records afterward from the dashboard/API.

Disconnect the dock network again and the Pi returns to `MODE -> OFFLINE`. It continues preserving new captures until connectivity returns.

## 4. Run Real Candidate Detection

Replace the timed demo capture with the lightweight Pi candidate model:

```bash
python dock_agent.py \
  --candidate-model models/YOLOv8_Small_2nd_Model.pt \
  --confidence 0.35 \
  --capture-cooldown 15
```

The Pi saves a JPEG only when that model produces a pothole label, with fifteen seconds between captures. Those candidate detections are uploaded directly to the cloud dashboard when the Pi becomes connected.

This direct-cloud configuration does **not** run the large full YOLOv8m model after upload. Vercel receives and stores the Pi candidate results. Adding cloud-side full-model confirmation later requires a separate Python worker or inference platform; Vercel's Next.js API is not currently a YOLO inference service.

## 5. Start At Boot

Create `/etc/pothole-cloud-agent.env`:

```bash
POTHOLE_API_URL=https://api-mu-ten-54.vercel.app
POTHOLE_API_WRITE_KEY=your-api-write-key
```

Protect the file and enable the service:

```bash
sudo chmod 600 /etc/pothole-cloud-agent.env
sudo cp systemd/pothole-cloud-agent.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now pothole-cloud-agent
sudo systemctl status pothole-cloud-agent
```

For the timed demonstration, run `dock_agent.py --demo-capture-interval 5` manually instead of enabling the service.