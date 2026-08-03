# Data Flow and Trust Boundaries — Phase 1

**Test ID:** P1-ARCH-03  
**Date/time:** 2026-07-24T01:02:43-04:00  
**Tester/tool:** Codex; read-only source/data-flow review  
**Tool version:** repository tooling versions not invoked  
**Tested version:** `81263265ce111468f9fac37818f920e1cd86a1a0`  
**Environment:** local checkout, source only  
**Expected result:** identify implemented paths, trust boundaries, sensitive data, and unimplemented cellular scope.  
**Actual result:** identified below.  
**Result:** Pass  
**Related finding:** F-P1-001, F-P1-002, F-P1-003  
**Evidence:** `P1-ARCH-03.md`

## Flows

```text
[Pi CSI camera] -> [Pi OpenCV pipeline] -> [Pi Flask HTTP/MJPEG + detections JSON] -> [LAN browser]
                           | optional frames
                           v
                       [Pi outputs/]

[Streamlit browser uploads/image/video/live camera]
      -> [Streamlit YOLO process + temporary files]
      -> [pothole_api_client.py: HTTPS POST + X-API-Key]
      -> [Next.js/Vercel API]
      -> [Supabase Storage: original/annotated objects]
      -> [Supabase DB: pothole_reports]
      -> [React dashboard: HTTPS GET + optional X-API-Key]
      -> [Browser map/UI]

[React user search] -> [public Nominatim HTTPS request]
[React map] -> [public CARTO HTTPS tile request]
[Pi startup] -> [public IP-geolocation HTTP request]
```

## Trust boundaries and input inventory

| Boundary | User-controlled or external input | Relevant implementation | Review focus in later phases |
|---|---|---|---|
| Camera → Pi process | Live camera frames | `CameraManager`, OpenCV processing | Hardware excluded until authorized; resource/format handling later. |
| LAN client → Pi Flask | Requests to four GET routes | `rpi_model/rpi_model/main.py` | No visible auth; test only against authorized local Pi/staging. |
| Browser → local Flask upload app | Filename and image bytes | `request.files['file']`, extension check, `secure_filename`, local writes | File type/content, traversal, collisions, debug exposure. |
| Browser → Streamlit | Image/video file bytes, WebRTC camera frames, API URL text | `file_uploader`, sidebar `text_input`, WebRTC | File size/types, URL trust, error/logging. |
| Streamlit → cloud API | Images, JSON metadata, lat/lon, severity, status, notes, API key | `requests.post` in `pothole_api_client.py` | Server-side validation, SSRF/endpoint selection, auth. |
| React → cloud API | Optional read key and API base URL at build time; GET response | `fetch(API_BASE + '/api/reports')` | Read-key exposure, response rendering/cache/CORS. |
| React → public services | Search text sent to Nominatim; tile requests to CARTO | `fetch` with encoded query; Leaflet tile URL | External URL/scheme restrictions, privacy/availability. |
| API → Supabase | Report values, image bytes, IDs | Supabase query builder and Storage client | RLS/storage policies, service-role scope, atomicity. |
| Pi → IP geolocation | Public IP request and response coordinates | `urllib.request.urlopen` to HTTP URL | TLS/privacy/response handling. |

## Database and object-storage operations

- `POST /api/reports`: server-side Supabase client uploads `original/` image and optional `annotated/` image, obtains public URLs, then inserts into `pothole_reports`.
- `GET /api/reports` and `GET /api/reports/[id]`: selects report data using Supabase query builder; optional region filtering occurs in application memory.
- `PATCH /api/reports/[id]`: updates supplied fields using query builder.
- `DELETE /api/reports/[id]`: removes referenced storage objects then deletes the row. This is a later authenticated staging test only.
- `POST /api/reports/backfill-locations`: selects reports with null latitude, calculates temporary locations, and updates rows.
- `api/supabase/rls_pothole_reports.sql` intends RLS enabled with no anon/authenticated table policies. No Storage bucket policy/migration was found.

No raw SQL construction was found in implemented runtime code; the SQL file is a migration/hardening script. Actual deployed RLS and Storage configuration cannot be verified from source alone.

## Sensitive storage/logging locations

- Secrets: expected in `api/.env.local`, `dashboard/.env.local`, and `backend/.env`; values not inspected.
- Images: local static upload/result paths, Pi `outputs/` when enabled, Streamlit temporary files, and Supabase Storage.
- Coordinates: Pi in-memory detection log/JSON and database reports/UI display.
- Logs: Streamlit logs local temporary paths and exceptions; Pi writes location lookup/capture errors to stderr; local Flask prints model-loading errors and tracebacks.

## Potentially sensitive implementation patterns (not exploit tests)

| Pattern | Location | Phase 1 observation |
|---|---|---|
| Shell execution | Repository source reviewed | No `subprocess`, `os.system`, `shell=True`, `eval`, or `exec` found in the implemented scoped applications. |
| SQL construction | API | Supabase query builder used; SQL exists only as reviewed RLS script. |
| Unsafe HTML | Pi dashboard | Inline script assigns API-derived detection fields through `innerHTML`; later XSS validation required. |
| File uploads/writes | Local Flask, Streamlit, API | Local Flask writes client-selected names after `secure_filename`; Streamlit uses temporary files; API Storage generates UUID-based object names. |
| External URL requests | Pi, Streamlit, React | Pi uses plaintext HTTP geolocation; Streamlit sidebar controls target API URL; React uses HTTPS geocoder/tile services. |

