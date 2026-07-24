# Pothole API

Backend API for the pothole project, built with **Next.js (Vercel)** and **Supabase**.

It stores:
- road images in Supabase Storage
- JSON detection metadata per image
- report fields like severity, status, location, and notes
- temporary map coordinates + Toronto region IDs (until real GPS is available)

## Architecture

```
Streamlit (detect) ──POST──► Vercel API ──► Supabase (DB + Storage)
Dashboard (map)    ◄──GET──┘
```

## Setup

1. Install dependencies:

```bash
cd api
npm install
```

2. Copy env values into `.env.local`:

```env
SUPABASE_URL=
SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
SUPABASE_STORAGE_BUCKET=pothole-images
```

3. Run locally:

```bash
npm run dev
```

Open `http://localhost:3000`

## API Endpoints

### Health check
`GET /api/health`

### List reports
`GET /api/reports`

Optional query: `?region=<region_id_or_name>`

### Create report (upload image + JSON metadata)
`POST /api/reports`

Use `multipart/form-data`:

- `image` (required) — road image file
- `annotated_image` (optional) — processed image with boxes
- `metadata` (optional) — JSON string; must include at least one detection
- `latitude`, `longitude` (optional — if omitted, a temporary in-region coordinate is assigned)
- `severity` — `critical`, `high`, `medium`, `low`
- `status` — `pending`, `in_progress`, `repaired`
- `notes` (optional)

**Important:** requests with zero detections are rejected (HTTP 400). Only real pothole detections become dashboard markers.

Example metadata:

```json
{
  "detections": [
    { "label": "pothole", "confidence": 0.87, "bbox": [120, 80, 220, 180] }
  ],
  "detection_count": 1,
  "source": "streamlit"
}
```

### Get / update / delete one report
- `GET /api/reports/:id`
- `PATCH /api/reports/:id`
- `DELETE /api/reports/:id`

### Backfill temporary locations
`POST /api/reports/backfill-locations`

Assigns persistent temp coordinates to existing detection records that have no latitude/longitude yet.

## Temporary location behaviour

When latitude/longitude are not provided, the API:

1. Picks a random Toronto neighborhood polygon (same GeoJSON the dashboard uses)
2. Samples a point inside that polygon
3. Stores `latitude`, `longitude`, `metadata.region_id`, `metadata.region_name`, and `metadata.temp_location=true`

Coordinates are **persisted in Supabase**, so they stay the same after dashboard refreshes.

**Limitation:** without a street network, points are guaranteed inside a region polygon, not necessarily on a painted road centerline. Replace this with real GPS later by sending `latitude`/`longitude` from Streamlit.

## Deploy to Vercel

1. Deploy the `api` folder
2. Add the same environment variables in Vercel
3. Ensure `data/toronto_regions.geojson` is included (see `next.config.ts`)

## Test upload with curl

```bash
curl -X POST http://localhost:3000/api/reports \
  -F "image=@/path/to/road.jpg" \
  -F 'metadata={"detections":[{"label":"pothole","confidence":0.91}],"detection_count":1}' \
  -F "severity=high" \
  -F "status=pending"
```

## Notes

- YOLO detection stays in the Python/Streamlit backend.
- `.env.local` is gitignored. Never commit real keys.
