# Pothole Local

No-Docker local test bundle for the pothole system.

Network:

- PC/API host: `192.168.137.1`
- Raspberry Pi: `192.168.137.137`

## What Runs Locally

- `api/` - Next.js API on `http://192.168.137.1:3000`
- `dashboard/` - Vite dashboard on `http://192.168.137.1:5173`
- `backend/` - Streamlit YOLO app on `http://192.168.137.1:8501`
- `rpi_model/rpi_model/` - Pi capture/uploader package copied with the mini model

The copied API is configured for `LOCAL_STORAGE_MODE=1`, so it stores reports in:

- `api/data/local-reports.json`
- `api/public/uploads/`

No Supabase or Docker is required for this local test mode.

## Start On The PC

Open PowerShell from this folder:

```powershell
cd "C:\Users\sthap\OneDrive\Desktop\Code\Sem 8\Capstone\Pothole\pothole-local"
Set-ExecutionPolicy -Scope Process Bypass
.\start-all-local.ps1
```

Or start services one at a time:

```powershell
.\start-api.ps1
.\start-dashboard.ps1
.\start-backend.ps1
```

Open:

- API health: `http://192.168.137.1:3000/api/health`
- Dashboard: `http://192.168.137.1:5173`
- Streamlit: `http://192.168.137.1:8501`

If the Pi or another device cannot reach the PC, allow inbound Windows Firewall access for ports `3000`, `5173`, and `8501`.

## Pi Setup

Copy or sync `rpi_model/rpi_model` to the Pi, then set `.env`:

```text
POTHOLE_API_URL=http://192.168.137.1:3000
POTHOLE_API_WRITE_KEY=local-dev-write-key
```

On the Pi:

```bash
cd /home/pi/pothole-rpi
./setup_pi.sh
./run_agent.sh --confidence 0.35 --candidate-interval 2 --capture-cooldown 15
```

For a simple connectivity/upload demo that does not run YOLO:

```bash
./run_agent.sh --demo-capture-interval 5
```

## Expected Flow

1. Pi posts candidate captures to `http://192.168.137.1:3000/api/reports`.
2. The local API saves image files and report JSON locally.
3. The dashboard fetches `http://192.168.137.1:3000/api/reports`.
4. New markers appear on the dashboard map.

## Docker

Docker files are still present, but this setup does not require Docker.


