# Working Agreement

## Meeting Information
- Weekly meeting day/time: Tuesdays at 7:00 PM (America/New_York)
- Meeting platform: Discord voice channel
- Backup platform: Microsoft Teams

## Communication Expectations
- Preferred channels: Discord for daily communication, GitHub comments for issue/PR context
- Expected response time: within 12 hours on weekdays, within 24 hours on weekends
- Urgent blockers: tag `@here` in Discord and open a GitHub issue immediately

## Accountability Rules
- Missing meetings without notice: responsible for publishing next meeting notes and action summary
- Repeated lateness (3+ times): temporary reduction in planning vote priority for that sprint
- Lack of participation: task reassignment plus documented recovery plan
- Failure to respond to teammates: escalation to team lead, then professor if unresolved

## GitHub Workflow Agreement
- No direct pushes to `main`; all changes must go through Pull Requests
- Minimum 1 reviewer approval required before merge
- PR must include linked issue and checklist completion
- Branch naming convention:
  - `hardware/<short-description>` for CAD or electronics integration work
  - `firmware/<short-description>` for embedded code updates
  - `software/<short-description>` for dashboard/backend/frontend updates
  - `docs/<short-description>` for documentation updates

## Testing Requirements
- Before merge, contributor must verify acceptance criteria from linked issue
- Hardware changes:
  - CAD fit check completed
  - IoT module placement and mounting constraints verified
- Firmware changes:
  - Build/flash verification completed
  - Sensor read + telemetry transmission validated on test device
- Software changes:
  - Relevant unit/integration tests pass
  - Manual smoke test of impacted dashboard flow completed
- Reviewer is responsible for confirming testing evidence is included in PR
