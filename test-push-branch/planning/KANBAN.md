# Kanban Board Setup

Suggested columns:
- To Do
- In Progress
- Reviewing
- Done

Yes, the board should be populated with actual issues. The assignment says issues should be placed in appropriate columns and the board should reflect current project state.

Initial population suggestion:
- `To Do`
  - CAD enclosure fit and mounting design
  - Firmware sensor sampling task
  - Dashboard timeline filter implementation
- `In Progress`
  - IoT module integration into CAD shell
- `Reviewing`
  - Event payload schema definition PR
- `Done`
  - Repository setup and project integration docs

Usage rules:
- New issues enter `To Do`.
- When a team member starts work, move to `In Progress`.
- When a PR is open, move to `Reviewing`.
- After merge and verification, move to `Done`.

Board hygiene:
- Every card must have an assignee.
- Every card must be linked to an issue.
- Every card in `Reviewing` must reference an open PR.
