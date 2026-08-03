# P1-ARCH-03 — Data Flow and Trust Boundary Review

- **Date/time:** 2026-07-24T01:02:43-04:00
- **Tester/tool:** Codex; read-only source inspection
- **Tool version:** not applicable (versions not invoked)
- **Repository version:** `81263265ce111468f9fac37818f920e1cd86a1a0`
- **Environment:** local checkout; no remote communications generated
- **Target:** Pi, Streamlit, Vercel/Next.js, Supabase, and React integration paths
- **Preconditions:** source checkout available
- **Sanitized procedure:** traced request, storage, database, rendering, filesystem, and URL call sites.
- **Expected result:** document data flows, sensitive data stores, and trust boundaries.
- **Actual result:** data flow mapped in `00-scope/data-flow.md`; plaintext Pi geolocation, user-configured Streamlit API target, and public/credentialed browser boundaries identified.
- **Result:** Pass
- **Related risk/finding:** F-P1-003
- **Recommended mitigation when failed:** move location lookup to HTTPS or remove it; restrict/configure outbound targets.

