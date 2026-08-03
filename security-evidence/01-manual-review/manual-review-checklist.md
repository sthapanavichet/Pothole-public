# Manual Review Checklist — Phase 1

**Test ID:** P1-BOUNDARY-04  
**Date/time:** 2026-07-24T01:02:43-04:00  
**Tester/tool:** Codex; read-only source inspection (`rg`, PowerShell)  
**Tool version:** repository tooling versions not invoked  
**Tested version:** `81263265ce111468f9fac37818f920e1cd86a1a0`  
**Environment:** local checkout; no services started  
**Preconditions:** repository available locally; no production access required  
**Procedure:** enumerated routes, request handlers, environment-name references, storage/database calls, filesystem operations, URL requests, rendering sinks, and shell/SQL patterns without reading secret values.  
**Expected result:** document all visible boundaries and flag items requiring later verification.  
**Actual result:** checklist below.  
**Result:** Pass (architecture review complete; items are not active-test results)  
**Related risks/findings:** F-P1-001 through F-P1-003  
**Evidence filename:** `P1-BOUNDARY-04.md`

| Area | Status | Observation / Phase 2+ action |
|---|---|---|
| Flask route inventory | Complete | Seven Flask routes documented in `route-inventory.csv`. |
| Cloud route inventory | Complete | Five concrete API paths, supported methods, CORS OPTIONS, auth coverage documented. |
| Authentication | Complete | Write routes call `requireWriteAuth`; report GET calls conditional `requireReadAuth`; health and both Flask apps have no visible route auth. Confirm dynamically only in authorized local/staging phase. |
| Environment names | Complete | Names recorded in system inventory; values excluded. |
| User-controlled inputs | Complete | Files, multipart fields, JSON, path/query IDs, region, notes, coordinates, React search, and Streamlit API URL identified. |
| Database/storage | Complete | Service-role Supabase client; reports table and public-URL object Storage use documented. Live policy state pending. |
| Shell execution | Complete | No scoped runtime occurrences of `subprocess`, `os.system`, `shell=True`, `eval`, or `exec` identified. Recheck with SAST. |
| SQL construction | Complete | No runtime string-built SQL identified; query builder used. RLS script should be reviewed/verified in staging. |
| HTML rendering | Complete | Pi dashboard `innerHTML` interpolates detection values; React JSX uses normal escaped rendering in reviewed component. Test with inert XSS canaries in staging. |
| File handling | Complete | Local Flask extension-only validation plus `secure_filename`; API MIME signature checks and size limit; Streamlit temporary files. Active malformed-file testing deferred. |
| URLs / SSRF boundary | Complete | Streamlit allows arbitrary sidebar API URL; Pi uses a hard-coded plaintext IP-geolocation URL; React search is encoded into a fixed HTTPS endpoint. |
| Filesystem writes | Complete | Pi optional frames; Flask static uploads/results; Streamlit temporary input/output; no output retention policy found. |
| Sensitive logging | Complete | Local paths/exceptions and Pi location may appear in logs/responses; exact logs not opened or generated. |
| Cellular implementation | Blocked | No executable cellular component or authorized simulator found. Required: local/staging simulator or implemented cellular client. |

## Preliminary manual-review findings

- **F-P1-001 — High:** Pi vision Flask routes expose live camera frames and location-bearing detection records without visible authentication. Requires local Pi/staging confirmation; no hardware testing was performed.
- **F-P1-002 — High:** separate local Flask upload interface uses a hard-coded session secret and enables Flask debug mode while binding to all interfaces. Static confirmation only; no service was started.
- **F-P1-003 — Medium:** Pi geolocation lookup is plaintext HTTP, exposing request/response integrity and privacy to the network path.

These remain open findings, not remediation actions. No application code was changed.

