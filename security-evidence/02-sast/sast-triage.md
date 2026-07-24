# SAST Triage — Phase 2

**Test ID:** P2-SAST-04  
**Date/time:** 2026-07-24T01:02:43-04:00  
**Tester/tool:** Codex; Ruff plus manual source review  
**Tool version:** Ruff 0.15.17; Bandit/Semgrep unavailable  
**Version/environment:** `81263265ce111468f9fac37818f920e1cd86a1a0`; local, read-only checkout  
**Procedure:** reviewed scanner output and manually checked credentials, execution, SQL, HTML, URLs, paths/writes, debug, errors, HTTP, randomness, and route auth.  
**Result:** Pass with blocked tools and findings carried forward.

| Review area | Result | Triage |
|---|---|---|
| Hard-coded credentials | Fail | Local Flask upload app contains a hard-coded session secret. Existing F-P1-002 remains High. No secret value is recorded. |
| `subprocess`, `os.system`, `eval`, `exec`, `shell=True` | Pass | No scoped runtime use found by manual search. |
| String-built SQL | Pass | No runtime SQL strings found; Supabase query builder used. |
| `innerHTML` / unsafe HTML | Observation | Pi inline dashboard inserts detection values into `innerHTML`; verify with harmless stored/DOM-XSS canary only in local/staging Phase 5/7. |
| External URLs | Fail | Pi location lookup uses plaintext HTTP (F-P1-003); Streamlit user can choose API URL. |
| User-influenced paths/writes | Observation | Local Flask uses `secure_filename` but extension-only validation; API generates UUID object paths and validates signatures; Streamlit writes temporary files. |
| Debug/error detail | Fail | Local Flask runs `debug=True`; Streamlit and local Flask include exception details in logs/UI. F-P1-002 remains High; error handling needs Phase 6 test. |
| Weak random for secrets | Pass | API storage names use `crypto.randomUUID`; no weak security-token generation found. |
| Missing route auth | Fail/conditional | Pi and local Flask have no auth; API mutations require write key; API reads become open if `API_READ_KEY` is unset by design. F-P1-001 remains High. |

Ruff's 23 diagnostics are code-quality issues, not confirmed vulnerabilities. Bandit, Semgrep, ESLint, and TypeScript checks are BLOCKED due unavailable executables/dependencies. Their absence is not evidence of a clean codebase.

