# Pothole API

Backend API for the pothole project, built with **Next.js (Vercel)** and **Supabase**.

It stores:
- road images in Supabase Storage
- JSON detection metadata per image
- report fields like severity, status, location, and notes

## Setup

1. Install dependencies:

```bash
cd api
npm install
```

2. Copy env values into `.env.local` (already created):

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

### Create report (upload image + JSON metadata)
`POST /api/reports`

Use `multipart/form-data`:

- `image` (required) — road image file
- `annotated_image` (optional) — processed image with boxes
- `metadata` (optional) — JSON string, e.g. detections from YOLO
- `latitude`, `longitude` (optional)
- `severity` — `critical`, `high`, `medium`, `low`
- `status` — `pending`, `in_progress`, `repaired`
- `notes` (optional)

Example metadata:

```json
{
  "detections": [
    { "label": "pothole", "confidence": 0.87, "bbox": [120, 80, 220, 180] }
  ],
  "model": "YOLOv8",
  "source": "streamlit-demo"
}
```

### Create report (JSON only)
`POST /api/reports`

Use `application/json` when the image is already uploaded somewhere else:

```json
{
  "image_url": "https://example.com/photo.jpg",
  "metadata": { "detections": [] },
  "severity": "high",
  "status": "pending"
}
```

### Get one report
`GET /api/reports/:id`

### Update report
`PATCH /api/reports/:id`

Example:

```json
{
  "status": "in_progress",
  "severity": "critical",
  "notes": "Scheduled for repair"
}
```

### Delete report
`DELETE /api/reports/:id`

## Deploy to Vercel

1. Push this repo to GitHub
2. Go to [vercel.com](https://vercel.com) and import the repo
3. Set **Root Directory** to `api`
4. Add environment variables in Vercel:
   - `SUPABASE_URL`
   - `SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_SECRET_KEY`
   - `SUPABASE_STORAGE_BUCKET`
5. Deploy

## Test upload with curl

```bash
curl -X POST http://localhost:3000/api/reports \
  -F "image=@/path/to/road.jpg" \
  -F 'metadata={"detections":[{"label":"pothole","confidence":0.91}]}' \
  -F "severity=high" \
  -F "status=pending"
```

## Notes

- YOLO detection should stay in the Python backend. This API stores results after detection.
- `.env.local` is gitignored. Never commit real keys.
