# Phase 6 Data Security and Privacy Test Plan

**Status:** D-01 and code-level portions can be reviewed locally; active/operational checks are BLOCKED pending authorized staging and test credentials.

| IDs | Safe procedure | Expected result |
|---|---|---|
| D-01–D-03 | Inventory URLs; use local/staging clients to verify TLS and capture only authorized, sanitized traffic. | Remote sensitive traffic uses HTTPS/TLS; plaintext redirected/refused. |
| D-04 | Controlled malformed requests and unavailable local dependency. | Generic error; no stack/path/SQL/provider/secret detail. |
| D-05 | Search authorized local/staging logs for sensitive classes only. | No unnecessary tokens, raw images, or precise coordinates. |
| D-06 | Review configured retention for frames/uploads/reports/logs/temp files. | Documented limits/deletion behavior. |
| D-07 | Verify staging RLS and Storage policy using browser-safe key. | Unauthorized direct read/write denied. |
| D-08 | Inspect staging response cache headers. | Sensitive responses not shared-cached unnecessarily. |
| D-09 | Document owner/scope/storage/rotation/revocation per credential without values. | Complete rotation process. |

No packet capture, production requests, or credentials are authorized by this plan.

