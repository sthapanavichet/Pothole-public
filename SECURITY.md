# Security Plan — Pothole Frontend & Backend

**Date:** July 2026  
**Scope:** Streamlit detection app, React dashboard, Vercel API, Supabase  
**Goal:** Make the system substantially harder to abuse while keeping the team workflow usable.

---

## 1. Current risks (before hardening)

| Risk | Impact |
|---|---|
| Anyone could `POST` images to the public API | Spam, storage abuse, fake detections |
| Anyone could `DELETE`/`PATCH` reports | Data loss / vandalism |
| CORS allowed all origins (`*`) | Any website could call the API from a browser |
| No rate limiting | Easy to overload YOLO-adjacent upload path |
| Supabase table had RLS disabled | Direct DB access if keys leak |
| Upload validation trusted `Content-Type` | Spoofed file types |
| API errors could leak internals | Information disclosure |

---

## 2. Security principles

1. **Least privilege** — frontends never get the Supabase secret key  
2. **Separate read vs write** — dashboard can read; only trusted clients can write  
3. **Defense in depth** — auth + CORS + rate limits + validation + RLS  
4. **Secrets stay out of git** — env vars only  
5. **Fail closed on writes** — if write key is missing/wrong, reject mutations  

---

## 3. Backend (Vercel API) controls

### 3.1 API keys
- **`API_WRITE_KEY`** — required for `POST`, `PATCH`, `DELETE`, and maintenance routes  
- **`API_READ_KEY`** — required for `GET /api/reports` (and single-report GET) when set  
- Clients send: `X-API-Key: <key>`

### 3.2 CORS allowlist
- Only allow configured origins (local dashboard + optional production dashboard URL)
- Reject browser calls from unknown sites

### 3.3 Rate limiting
- Per-IP soft limits on all API routes  
- Stricter limits on write/upload endpoints  

### 3.4 Upload hardening
- Allow only JPG/PNG/WEBP  
- Max size 10MB  
- Validate **magic bytes** (file content), not only MIME type  
- UUID + sanitized filenames (already used)

### 3.5 Input validation
- Reject empty detections  
- Cap metadata JSON size  
- Cap notes length  
- Validate severity/status enums  

### 3.6 Safe errors
- Production responses return generic messages for 500s  
- Detailed errors logged server-side only  

### 3.7 Maintenance endpoints
- `/api/reports/backfill-locations` requires write key  

---

## 4. Database / storage (Supabase) controls

### 4.1 Row Level Security (RLS)
- Enable RLS on `pothole_reports`  
- Deny direct anon/authenticated client writes  
- App continues to use **server-side secret key** through the API only  

### 4.2 Storage
- Keep uploads going through the API (validated)  
- Prefer private bucket + signed URLs later; public bucket OK for demo if RLS/API protect writes  

### 4.3 Secrets
- Never expose `SUPABASE_SECRET_KEY` to Streamlit UI, dashboard JS, or GitHub  

---

## 5. Frontend controls

### 5.1 React dashboard
- Uses **read key only** (publishable-ish), never write/secret keys  
- Reads via API, not direct Supabase admin access  
- No secrets committed; `VITE_API_READ_KEY` is still visible in browser bundles — treat as a shared team token, not a root secret  

### 5.2 Streamlit
- Sends **write key** from environment (`POTHOLE_API_WRITE_KEY`), not from a public UI field  
- Continues to run YOLO locally; only posts results to the secured API  

---

## 6. Operational checklist

1. Generate keys and store in `api/.env.local` + Vercel env  
2. Put write key in Streamlit env (`backend/.env` → `POTHOLE_API_WRITE_KEY`)  
3. Put read key in dashboard `.env.local` as `VITE_API_READ_KEY`  
4. Run Supabase RLS SQL (`api/supabase/rls_pothole_reports.sql`)  
5. Redeploy API to Vercel with the same `API_*` keys  
6. Verify unauthorized write fails; authorized write works  

---

## 7. Implementation status (this repo)

| Control | Status |
|---|---|
| `API_WRITE_KEY` on POST/PATCH/DELETE/backfill | Implemented (`api/lib/auth.ts`) |
| `API_READ_KEY` on GET reports | Implemented (required when env is set) |
| CORS allowlist | Implemented (`api/lib/http.ts`) |
| Per-IP rate limits | Implemented (`api/lib/rateLimit.ts`) |
| Magic-byte image validation | Implemented (`api/lib/storage.ts`) |
| Safer production 500s | Implemented (`publicError`) |
| Streamlit write key header | Implemented (`backend/pothole_api_client.py`) |
| Dashboard read key header | Implemented (`dashboard/src/App.jsx`) |
| Supabase RLS SQL script | Provided (`api/supabase/rls_pothole_reports.sql`) — run in Supabase |

---

## 8. Out of scope (later / production)

- Full user login (Supabase Auth / OAuth)  
- Private storage with signed URLs for every image  
- WAF / bot protection beyond basic rate limits  
- Dependency scanning CI (recommended next)  

These are good next steps after the mid-project demo.
