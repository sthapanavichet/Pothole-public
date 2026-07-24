# Dependency Summary — Phase 3

**Test IDs:** P3-DEP-01 through P3-DEP-03  
**Date/time:** 2026-07-24T01:02:43-04:00  
**Version/environment:** `81263265ce111468f9fac37818f920e1cd86a1a0`; local read-only checkout.

| Project | Manifest/lock state | Audit status | Result |
|---|---|---|---|
| `api` | `package.json` and `package-lock.json` present | npm lockfile audit completed | Fail: 3 high-severity entries, F-P3-001. |
| `dashboard` | `package.json` and `package-lock.json` present | npm lockfile audit completed | Pass: 0 production advisories reported. |
| `backend` | `requirements.txt`; no Python lockfile | pip-audit unavailable | Blocked; `torch`, `torchvision`, `torchaudio`, `numpy`, and `streamlit-webrtc` are unpinned. |
| `backend/interface-app` | `requirements.txt`; no Python lockfile | pip-audit unavailable | Blocked; most listed packages pinned, but no resolver lockfile. |
| `rpi_model/rpi_model` | `requirements.txt`; no Python lockfile | pip-audit unavailable | Blocked; all listed Python dependencies are unpinned. |
| `codex-video-processing-docs` | `requirements.txt`; no Python lockfile | pip-audit unavailable | Blocked; duplicate/archive material, dependencies require inventory decision. |

No SBOM (CycloneDX, SPDX, or equivalent) was found. Missing Python lockfiles and unpinned dependencies are recorded as F-P3-002. “Abandoned” status cannot be reliably determined without package/repository research and is not asserted here.

