# Remediation Plan

| Priority | Finding | Recommended action | Verification |
|---|---|---|---|
| P0 | F-P1-002 | Move Flask session secret to managed environment, rotate it, disable debug, and avoid public bind unless protected. | A-01, D-04, I-07, I-08. |
| P0 | F-P3-001 | Upgrade Next.js to a nonaffected supported version; regenerate lockfile and regression test. | P3-DEP-02 plus AV-02/D-04 where applicable. |
| P1 | F-P1-001 | Authenticate or network-isolate Pi streams and minimize exposed location/detection data. | A-01, D-05, AV-01. |
| P1 | F-P1-003 | Replace plaintext location lookup with HTTPS/certificate validation or remove it. | D-01–D-03. |
| P1 | F-P3-002 | Pin Python dependencies, add reproducible lockfiles/SBOM, and audit them. | P3-DEP-01 and P3-DEP-02. |
| P2 | F-P3-003 | Create model provenance/checksum manifest and deployment verification. | P3-DEP-03. |

Owners are project maintainers until named owners are assigned. None are closed; no fixes were made in this assessment.

