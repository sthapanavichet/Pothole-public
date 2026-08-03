# P1-ROUTE-02 — Route and Authentication Inventory

- **Date/time:** 2026-07-24T01:02:43-04:00
- **Tester/tool:** Codex; `rg` and read-only source inspection
- **Tool version:** not applicable (versions not invoked)
- **Repository version:** `81263265ce111468f9fac37818f920e1cd86a1a0`
- **Environment:** local repository checkout; no endpoints requested
- **Target:** Flask and Next.js route handlers plus authentication middleware
- **Preconditions:** source checkout available
- **Sanitized procedure:** inspected Flask decorators, Next.js `route.ts` exports, and `api/lib/auth.ts`; recorded HTTP method and auth behavior without invoking routes.
- **Expected result:** complete route/method inventory and auth location/coverage.
- **Actual result:** inventory is in `00-scope/route-inventory.csv`; `api/lib/auth.ts` protects mutations with write key and report reads conditionally with read key. Pi and local Flask routes lack visible auth.
- **Result:** Pass
- **Related risk/finding:** F-P1-001, F-P1-002
- **Recommended mitigation when failed:** restrict local services to authenticated/reverse-proxied access before deployment; validate dynamically only in authorized local/staging.

