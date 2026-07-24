# Streamlit ↔ Dashboard Integration

## Flow

1. User uploads a road image in **Streamlit** (`backend/main.py`).
2. YOLO detects potholes.
3. If **at least one pothole** is found, Streamlit POSTs the original image, annotated image, and detection JSON to the **Vercel API** (`api/`).
4. The API stores images in **Supabase Storage** and creates a row in **`pothole_reports`**.
5. If no GPS is provided, the API assigns a **temporary coordinate inside a Toronto neighborhood** and stores region id/name.
6. The **React dashboard** (`dashboard/`) fetches `/api/reports` and renders markers + region galleries.

## Run locally

### API
```bash
cd api
npm install
# ensure .env.local has Supabase keys
npm run dev -- --port 3002
```

### Streamlit
```bash
cd backend
# ensure backend/.env has POTHOLE_API_WRITE_KEY (see .env.example)
streamlit run main.py
```
In the sidebar, set **Backend API URL** to `http://localhost:3002` while testing locally
(or keep `https://api-mu-ten-54.vercel.app` for production).

### Dashboard
```bash
cd dashboard
npm install
# dashboard/.env.local needs VITE_API_READ_KEY matching API_READ_KEY
npm run dev
```
Open the Vite URL (usually `http://localhost:5173`).

## Production API

Default dashboard + Streamlit target:
`https://api-mu-ten-54.vercel.app`

After changing API code, set `API_WRITE_KEY` / `API_READ_KEY` in Vercel env, then redeploy:
```bash
cd api
npx vercel --prod
```

Backfill older detections that have no coordinates:
```bash
curl -X POST https://api-mu-ten-54.vercel.app/api/reports/backfill-locations \
  -H "X-API-Key: $API_WRITE_KEY"
```

## Environment variables

### `api/.env.local`
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`
- `SUPABASE_STORAGE_BUCKET=pothole-images`
- `API_WRITE_KEY` (required for mutations)
- `API_READ_KEY` (required for GETs when set)
- `CORS_ALLOWED_ORIGINS` (optional extra dashboard origins)

### `dashboard/.env.local`
- `VITE_API_URL=https://api-mu-ten-54.vercel.app`
- `VITE_API_READ_KEY` (must match `API_READ_KEY`)

### Streamlit (`backend/.env`)
- `POTHOLE_API_URL` (optional override; sidebar field also works)
- `POTHOLE_API_WRITE_KEY` (must match `API_WRITE_KEY`)

See `SECURITY.md` for the full hardening plan.

## Assumptions

- Shared backend is the existing Vercel API + Supabase table/storage.
- Temporary locations are sampled inside neighborhood polygons (same GeoJSON as the dashboard).
- Only YOLO labels containing `"pothole"` become dashboard records.
- Streamlit deduplicates saves per uploaded `file_id` within a session.

## Limitations

- Temporary coordinates are **inside a region**, not guaranteed to sit on a street centerline.
- Real GPS / EXIF location should replace `assignTemporaryLocation()` later.
- Production Vercel must be redeployed to pick up local API changes.
