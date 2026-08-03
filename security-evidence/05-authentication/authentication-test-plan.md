# Phase 4 Authentication and Authorization Test Plan

**Status:** Planned; active tests BLOCKED pending authorized local/staging API/Pi/Supabase environment and disposable test data. Production is excluded.

| ID | Safe procedure | Expected result | Required evidence/prerequisite |
|---|---|---|---|
| A-01 | From separate local client, request each Pi route with no credential. | 401/403/network denial. | Sanitized request/response; Pi staging; no hardware change. |
| A-02 | GET each protected cloud route without key. | 401. | Local/staging API; sanitized response. |
| A-03 | POST/PATCH/DELETE/backfill without key; compare disposable DB row/object counts before/after. | 401, no change. | Staging Supabase and test bucket/table. |
| A-04 | Repeat protected requests with harmless invalid key. | 401 without detailed auth error. | Local/staging API. |
| A-05 | Use read key on each mutation against disposable data. | Denied/no change. | Read key and staging API/DB. |
| A-06 | Use write key outside documented operations. | Only explicit permitted actions succeed. | Scoped staging write key and disposable records. |
| A-07 | Query table/storage using only browser-safe key. | RLS/policies deny unauthorized access. | Staging Supabase project and nonproduction keys. |
| A-08 | Start Streamlit without write key and attempt save. | No request; no secret in UI/error. | Local Streamlit only. |
| A-09 | Inspect locally built React bundle/storage/network configuration. | No write/service/device key. | Local dashboard build and browser session. |

Stop condition: any unexpected successful mutation; immediately capture sanitized evidence, compare before/after counts, and stop affected test family.

