# Quality Assurance and CI/CD Strategy

## Project Overview

This repository supports a pothole detection capstone project. The intended system is a road anomaly detection application that can process road images or videos, identify potholes and related pavement defects, and provide reliable results for review by users or municipal infrastructure teams.

Because the repository is currently early-stage, this QA strategy establishes the baseline professional testing and CI/CD process before more application code is added. The strategy is designed to scale from lightweight helper tests today to full model, frontend, and end-to-end testing later.

## A. Testing Goals

Testing is important because pothole detection software can influence infrastructure reporting and repair decisions. Incorrect detections, broken uploads, or unreliable processing could mislead users and reduce trust in the system.

The main testing goals are:

- Verify that media processing helpers handle valid and invalid inputs correctly.
- Prevent regressions in confidence threshold validation, media path validation, output path generation, and label formatting.
- Establish a CI pipeline that runs automatically on pushes and pull requests.
- Keep the repository consistent across team member machines.
- Catch syntax errors, lint failures, and broken tests before code is merged.
- Prepare the project for future model inference, frontend, backend, and end-to-end testing.

## Key Project Risks

The project risks include:

- YOLO or future computer vision models may fail to detect potholes or cracks.
- False positives may incorrectly mark normal road surfaces as potholes.
- False negatives may miss dangerous road damage.
- Uploaded images or videos may be missing, corrupted, unsupported, or too large.
- Local file paths may work on one computer but fail in CI.
- Large model files may slow CI or make repository operations difficult.
- Future frontend filters or map displays may show incorrect pothole records.
- GeoJSON or map data may fail to load in the future interface.
- API keys, local file paths, or private data could be committed accidentally.
- Direct pushes to `main` could bypass review and break the project.
- Python dependencies may become inconsistent across environments.

## Most Critical Failure Types

The most critical failures are:

- Detection failure: valid potholes or road damage are not detected.
- Incorrect output labeling: detections are shown with wrong labels or confidence values.
- Broken media workflow: users cannot process images or videos.
- Security failure: unsafe files, exposed secrets, or unvalidated input.
- CI failure: untested or broken changes merge into the main branch.

## B. Planned Types of Testing

### Smoke Testing

Smoke testing will verify the main workflows after major changes.

Manual smoke tests should include:

- Run the Python test suite.
- Run the Python linter.
- Process a known sample image after model inference code is added.
- Process a short known sample video after video processing code is added.
- Confirm generated output files are named and stored correctly.
- Confirm the application does not expose local credentials or secrets.

Visual verification will still be required for model output because automated tests cannot fully judge whether a detection box is useful or accurate.

### Unit Testing

Unit tests use `pytest` and focus on deterministic logic that does not require loading large model weights.

Current unit test targets:

- Confidence threshold validation.
- Supported image and video extension checks.
- Existing media path validation.
- Output file path generation.
- Detection label formatting.
- Unknown class ID handling.

Future unit test targets:

- Image preprocessing helpers.
- Video frame sampling helpers.
- Model result normalization.
- API request validation.
- Frontend filtering and search helpers if a frontend is added.

Minimum coverage goal:

- Short term: cover all helper logic used by CI.
- Long term: at least 70% coverage for pure application logic.

### Integration Testing

Integration tests should verify that major parts of the system work together.

Planned integration tests:

- Media validation helpers with real fixture files.
- Video processing with a short test video.
- Model inference wrapper with a small sample image.
- Backend upload endpoint with media validation.
- Frontend-to-backend communication if a frontend is added.

Normal CI should avoid full YOLO model loading because model files are large and inference can be slow. Model integration tests should run manually or in a separate scheduled workflow when compute resources are available.

### End-to-End Testing

Future end-to-end tests should cover complete user workflows.

Planned E2E workflows:

- User uploads an image and receives an annotated result.
- User uploads a video and downloads the processed output.
- User views detected potholes on a map if a mapping interface is added.
- User filters potholes by severity, status, date, or location if those features are added.

Recommended tools:

- Playwright for browser-based workflows.
- Manual smoke test checklist for model demos.

### Performance and Load Testing

Performance testing matters because video processing and model inference can become slow.

Performance risks:

- Large videos may take too long to process.
- CPU-only machines may run inference slowly.
- Large model files may slow CI.
- Future map data may slow frontend rendering.

Planned measurements:

- Average inference time per image.
- Average processing time per video frame.
- Total processing time for a short sample video.
- CI runtime.

Target expectations:

- Lightweight CI should complete in under 10 minutes.
- Model benchmarks should be documented separately from normal CI.
- Large model files should not be loaded in every pull request check.

### Security Testing

Security testing will focus on media input, secrets, and safe file handling.

Security concerns:

- Uploaded files may be malformed or unsupported.
- User-controlled filenames may create unsafe paths.
- Local paths may expose developer information.
- API keys or tokens must not be committed.
- Large uploads could exhaust memory or disk space.

Security checks:

- Validate file existence and supported extensions.
- Avoid trusting user-provided filenames for output paths.
- Keep `.env`, credentials, tokens, and private keys out of Git.
- Review dependency changes before merging.
- Keep CI logs free of secrets.

## C. Pull Request Quality Rules

Pull requests must follow these rules:

- Pull requests must pass GitHub Actions before merging.
- Pull requests must pass Python linting.
- Pull requests must pass Python tests.
- At least one teammate must review each pull request.
- No direct pushes to `main`.
- Pull requests must describe what changed and how it was tested.
- New helper logic should include unit tests.
- Large model files should not be added unless the team agrees they are required.
- New user-facing behavior should include screenshots or demo notes.

## Team QA Responsibilities

Recommended responsibilities:

- ML/model owner: validates model output quality, tracks false positives and false negatives, and maintains sample media.
- Python/backend owner: maintains processing code, validation logic, and Python tests.
- Frontend owner: maintains UI tests and map/filter behavior if a frontend is added.
- DevOps/QA owner: maintains GitHub Actions, pull request rules, issue tracking, and release evidence.
- Scrum presenter: explains CI results, QA progress, known risks, and remaining testing work.

## CI/CD Strategy

The repository uses GitHub Actions to run checks on pushes and pull requests.

The CI pipeline performs:

- Repository checkout.
- Python setup.
- Python QA dependency installation.
- Static analysis with ruff.
- Unit testing with pytest.

The workflow intentionally avoids loading large machine learning model files. Future full inference tests should be added as manual or scheduled checks.

## Testing Backlog

The following GitHub Issues should be created:

- Add pytest coverage for media processing helpers.
- Configure GitHub Actions CI pipeline.
- Add ruff linting for Python scripts.
- Add sample media smoke test checklist.
- Add model inference integration test with fixture image.
- Add Playwright E2E tests if a frontend is added.
- Document QA strategy in `/docs/QA.md`.
- Add CI badge to README.

## Definition of Done

A task is done when:

- Code is committed to a feature branch.
- CI passes on GitHub Actions.
- Relevant tests or documentation are updated.
- The pull request explains testing performed.
- A teammate reviews the change.
- The change is merged only after required checks pass.
