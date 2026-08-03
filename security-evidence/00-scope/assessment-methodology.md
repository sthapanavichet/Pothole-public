# Security Assessment Methodology and Tools

This plan uses defense-in-depth techniques and does not authorize production attacks, hardware tests, destructive actions, or secret disclosure.

| Technique | Tools/procedure | Phase | Safety boundary |
|---|---|---|---|
| Manual architecture/code review | `rg`, source review, route/data-flow inventory | 1–3 | Read-only local checkout. |
| SAST | Ruff; Bandit and Semgrep security rules when installed; ESLint and TypeScript compiler from lockfile-restored dependencies | 2 | Read-only local scan; scanner findings manually triaged. |
| Dependency/secret review | `npm audit --package-lock-only`, `pip-audit`, Gitleaks, lockfile/SBOM/provenance inventory | 3 | No package upgrades; no secret values in evidence. |
| Authentication/authorization DAST | Sanitized `curl`/HTTP client requests and before/after disposable row/object counts | 4 | Local/staging only; stop on unexpected mutation. |
| Input-validation DAST | Harmless canary metadata/files/requests; browser devtools where applicable | 5, 7 | Local/staging only; no destructive injection payloads. |
| Data-security review | Browser/network inspector, sanitized local/staging TLS/header/error/log review, Supabase policy inspection | 6, 7 | No production traffic capture; no credentials saved. |
| Passive web scanning (optional) | OWASP ZAP or Burp Suite passive scan against local/staging only | 7 | Active scans disabled unless separately approved; never production. |
| Controlled availability | Local/staging monitoring and fixed request/viewer limits | 8 | Requires explicit approval, pre-agreed thresholds, and immediate stop conditions. |

Every test record includes test ID, time, tool/version, commit, environment, target, preconditions, sanitized procedure, expected/actual result, status, finding link, evidence file, and mitigation where relevant.

