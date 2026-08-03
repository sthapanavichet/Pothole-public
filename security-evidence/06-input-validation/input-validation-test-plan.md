# Phase 5 Input Validation and Injection Test Plan

**Status:** Planned; BLOCKED pending local/staging API and disposable Supabase data/storage. All requests use harmless canaries only.

| IDs | Safe test cases | Expected result |
|---|---|---|
| I-01 | `detection_count: 0` | 400; no row/object. |
| I-02 | Array/null/string wrong types and missing required fields | 400; no partial persistence. |
| I-03 | Negative/out-of-range counts, confidence, lat/lon, and huge dimensions | Rejection. |
| I-04 | Invalid severity/status values | 400. |
| I-05 | Inert XSS marker strings in notes/location | Rejected or inert text; no marker execution. |
| I-06 | Harmless SQL canaries in IDs/filters/notes | Validation/no-result; no SQL error/bypass. |
| I-07 | Traversal, encoded traversal, multi-extension, metacharacter filenames | Safe generated name or rejection; no path escape/execution. |
| I-08 | HTML/text bytes mislabeled as image, unsupported/malformed/oversize image | Rejection before storage. |
| I-09 | Bounded oversized JSON, long notes, arrays, duplicate params, malformed multipart, unsupported type | 400/413 without instability. |
| I-10 | Direct crafted API requests bypassing frontend | Server independently enforces rules. |

For every rejected request, record sanitized request/response and database/object counts before and after. Stop after any partial persistence.

