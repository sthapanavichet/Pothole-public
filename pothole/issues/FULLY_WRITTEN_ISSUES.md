# Example Fully Written Issues

## Issue 1
Title: As a Hardware Engineer, I want a CAD enclosure that fits the sensor and IoT modules so that the deployed unit is compact and protected.

## Description
Design and validate a CAD enclosure that houses the microcontroller, sensor package, and communication module while preserving serviceability and mounting stability.

## Acceptance Criteria
- [ ] CAD model includes mounting points for all selected modules.
- [ ] Enclosure dimensions satisfy installation space constraints.
- [ ] Design includes cable routing and access for maintenance.
- [ ] Exported files are ready for prototype fabrication.

## Testing Criteria
- [ ] Dry-fit test confirms module alignment and clearance.
- [ ] Vibration simulation or manual shake test shows no loose components.
- [ ] Assembly can be completed and reopened without component damage.

## Notes
Assign to milestone: Hardware Integration.

---

## Issue 2
Title: As a Firmware Developer, I want embedded firmware to collect accelerometer and GPS data so that road-surface events can be detected and transmitted.

## Description
Implement firmware tasks for sampling motion/location data, deriving pothole events from thresholds, and transmitting event payloads through IoT connectivity.

## Acceptance Criteria
- [ ] Firmware reads accelerometer and GPS data at configured intervals.
- [ ] Pothole event logic is triggered from defined thresholds.
- [ ] Event payload includes timestamp, location, and severity score.
- [ ] Device retries transmission on temporary network failures.

## Testing Criteria
- [ ] Firmware builds and flashes successfully to target board.
- [ ] Bench test with simulated vibration triggers event creation.
- [ ] Confirm event payload is received by software ingestion endpoint.

## Notes
Assign to milestone: Firmware Data Pipeline.

---

## Issue 3
Title: As a Data Reviewer, I want a dashboard that visualizes pothole events on a map and timeline so that I can prioritize road maintenance.

## Description
Create a software dashboard that displays ingested events with map markers, severity coloring, and timeline filtering.

## Acceptance Criteria
- [ ] Dashboard lists events with location, timestamp, and severity.
- [ ] Map view renders event pins with severity-based colors.
- [ ] Timeline/date filter updates visualizations correctly.
- [ ] User can open an event detail panel from map or list.

## Testing Criteria
- [ ] UI renders correctly with sample and live event data.
- [ ] Filters return consistent counts across list and map views.
- [ ] Basic responsiveness validated on desktop and mobile widths.

## Notes
Assign to milestone: Software Visualization.

---

## Issue 4
Title: As a Project Integrator, I want a validated hardware-firmware-software data pipeline so that sensor events appear reliably in the dashboard.

## Description
Run end-to-end integration tests from sensor trigger to dashboard display and document failure points with corrective actions.

## Acceptance Criteria
- [ ] A generated field event appears in dashboard within target latency.
- [ ] Failed transmissions are retried and eventually resolved.
- [ ] Integration test steps are documented for repeatability.
- [ ] Known limitations are captured in project notes.

## Testing Criteria
- [ ] At least 5 successful end-to-end event runs are recorded.
- [ ] One simulated network interruption test is completed.
- [ ] Evidence (logs/screenshots) attached to issue or PR.

## Notes
Assign to milestone: End-to-End Validation.
