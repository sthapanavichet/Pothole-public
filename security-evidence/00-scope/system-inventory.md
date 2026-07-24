# System Inventory — Phase 1

**Test ID:** P1-SCOPE-01  
**Date/time:** 2026-07-24T01:02:43-04:00  
**Tester/tool:** Codex; read-only file inventory and source inspection (`rg`, PowerShell)  
**Tool version:** repository tooling versions not invoked  
**Tested version:** Git commit `81263265ce111468f9fac37818f920e1cd86a1a0` (`main`, clean at inspection)  
**Environment:** local repository checkout; no application or hardware started; no remote endpoint contacted  
**Result:** Pass — repository structure confirmed and in-scope components identified.

## Scope coverage determination

The repository materially covers all four requested interfaces. The cellular interface is **planned/documented only**: no deployable modem, SIM, AT-command, queue/retry, or cellular upload implementation was found. Phase 4/6/8 cellular tests therefore require a local/staging simulator or implemented component and will be marked BLOCKED unless provided.

| Interface | Repository evidence | Stack and entry points | Scope status |
|---|---|---|---|
| 1. Edge firmware and local services | `rpi_model/rpi_model/`; `backend/interface-app/` | Python, OpenCV, Picamera2, Flask. Pi entry: `rpi_model/rpi_model/main.py`; separate image-upload Flask entry: `backend/interface-app/app.py`. | Implemented proof-of-concepts; no firmware source found. |
| 2. Cellular communication | `backend/technical_implementation.tex` describes a bearer-token upload concept. | Documentation only. | Planned; implementation absent. |
| 3. Cloud backend and data services | `api/` | Next.js 15 TypeScript route handlers, Supabase JS client, SQL RLS hardening script. | Implemented. |
| 4. Frontend applications | `backend/`; `dashboard/` | Streamlit/Python detection app; Vite + React map dashboard. | Implemented. |

## Application directories and technology stacks

| Directory | Purpose | Technology | Security-relevant notes |
|---|---|---|---|
| `rpi_model/rpi_model` | Pi camera detection and live dashboard | Python, Flask, Picamera2, OpenCV | Serves network-bound HTTP/MJPEG at configured host/port; optional frame persistence. |
| `backend` | Streamlit YOLO image/video/live-camera detector and API client | Python, Streamlit, Ultralytics, OpenCV, Requests | Uploads reports to cloud API using environment-loaded write key; writes temporary video files. |
| `backend/interface-app` | Separate local Flask image upload/inference interface | Python, Flask, Ultralytics, OpenCV | Handles browser image upload and writes originals/results under static directories. |
| `api` | Vercel/Next.js API and Supabase integration | TypeScript, Next.js, Supabase JS | Auth, CORS, rate limiting, validation, storage upload/delete, database access. |
| `dashboard` | Map dashboard | React 19, Vite, Leaflet | Calls cloud reports API with browser-visible read key when configured; requests public map/geocoding services. |
| `api/supabase` | Database hardening script | SQL | Enables RLS and defines no anon/authenticated table policies; storage policy evidence not present. |
| `Testing`, `rpi_model_tests` | Unit test material | Python/pytest-style | Supporting test content, not deployed services. |
| `codex-video-processing-docs`, duplicate model/result directories | Documentation/model artifacts | Python, notebooks, YOLO weights | Model provenance/checksum review belongs to Phase 3. |

## Entry points and local behavior

- Pi vision service: `rpi_model/rpi_model/main.py` starts camera capture, calls an external IP geolocation URL, runs Flask with `debug=False`, and exposes live JPEG streams plus detection data.
- Streamlit app: `backend/main.py`; offers image, video, and browser camera input. A sidebar accepts a backend API URL; posting is delegated to `backend/pothole_api_client.py`.
- Local upload Flask app: `backend/interface-app/app.py`; runs with `debug=True`, host `0.0.0.0`, port 5000, and processes `multipart/form-data` image uploads.
- Cloud API: `api/app/api/**/route.ts`; Vercel/Next.js route handlers access Supabase using a server-side secret key.
- React app: `dashboard/src/main.jsx` → `dashboard/src/App.jsx`; fetches reports, local GeoJSON, a public geocoder, and map tiles.

## Environment-variable names (values not inspected)

| Component | Names discovered | Use |
|---|---|---|
| Cloud API | `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `SUPABASE_STORAGE_BUCKET`, `API_WRITE_KEY`, `API_READ_KEY`, `CORS_ALLOWED_ORIGINS`, `NODE_ENV` | Supabase connection/bucket, read/write key checks, CORS configuration, error behavior. |
| Streamlit client | `POTHOLE_API_URL`, `POTHOLE_API_WRITE_KEY` | Destination override and write authentication. |
| React dashboard | `VITE_API_URL`, `VITE_API_READ_KEY` | API base URL and browser-visible read token. |
| Pi service | None found | Configuration is hard-coded in `config.py`, not environment-driven. |

## Sensitive-data inventory

| Data class | Locations/flows | Storage or logging observations |
|---|---|---|
| API write/read credentials and Supabase secret | Environment files/configuration; request headers | Values were not read. Streamlit client loads `backend/.env`; dashboard embeds configured read token into client bundle by design. |
| Camera/uploaded imagery | Pi memory/optional `outputs/`; Flask `static/uploads` and `static/results`; Supabase Storage; Streamlit browser/temp files | Repo includes example images/model artifacts. Retention and storage policy are not documented; test in Phase 6. |
| Location coordinates | Pi IP geolocation response and detection log; report rows/React map | Pi emits coordinates through unauthenticated detection endpoint; dashboard displays report coordinates. Exact values excluded from evidence. |
| Detection metadata/notes | Streamlit → API → Supabase `pothole_reports` | API exposes report fields to authenticated reads or open reads if no read key is configured. |
| Local paths/errors | Streamlit logs and user-facing exception messages; Flask upload error handling | Detailed error disclosure requires Phase 2/6 confirmation. |

## Planned cellular interface

The only cellular-adjacent material found is a technical document containing a conceptual authenticated upload. There is no code to enumerate cellular hardware, send AT commands, manage a SIM/APN, queue reports, retry/back off, or transmit via a cellular transport. No hardware testing was performed.

**Evidence:** `system-inventory.md`; `P1-SCOPE-01.md`.

