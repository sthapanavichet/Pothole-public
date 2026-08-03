# Phase 8 Controlled Availability Test Plan

**Status:** BLOCKED. Requires explicit approval plus local/staging target, written stop limits, and monitoring. Never run against production.

| ID | Controlled scenario | Required stop limit/evidence |
|---|---|---|
| AV-01 | Increment local Pi MJPEG viewers gradually. | Pre-agreed CPU/memory/network/FPS threshold and recovery observation. |
| AV-02 | Small authorized API burst. | Fixed request count/duration; stop on latency/error threshold; expect 429/Retry-After. |
| AV-03 | Strictly limited oversized-upload repeats. | Fixed count and test bucket; no storage growth. |
| AV-04 | Simulate cellular outage. | Simulator/local client only; bounded retries/backoff. |
| AV-05 | Fill a dedicated temporary test directory to quota. | Isolated directory only; stop before host disk impact. |
| AV-06 | Extreme non-destructive Pi configuration values. | Local config copy only; reject/clamp safely. |

