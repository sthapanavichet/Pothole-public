# Quality Assurance and CI/CD Strategy

## Project Overview

This repository supports a pothole detection capstone project. The intended system is a road anomaly detection application that can process road images or videos, identify potholes and related pavement defects, and provide reliable results for review by users or municipal infrastructure teams.

Because the repository is currently early-stage, this QA strategy establishes the baseline professional testing and CI/CD process before more application code is added. The strategy is designed to scale from lightweight helper tests today to full model, frontend, and end-to-end testing later.

## A. Testing Goals

Testing is important because pothole detection software can influence infrastructure reporting and repair decisions. Incorrect detections, broken uploads, or unreliable processing could mislead users and reduce trust in the system.

The main testing goals are:

* Verify that media processing helpers handle valid and invalid inputs correctly.
* Prevent regressions in confidence threshold validation, media path validation, output path generation, and label formatting.
* Establish a CI pipeline that runs automatically on pushes and pull requests.
* Keep the repository consistent across team member machines.
* Catch syntax errors, lint failures, and broken tests before code is merged.
* Prepare the project for future model inference, frontend, backend, and end-to-end testing.

### Key Risks

* Detection failure: valid potholes or road damage are not detected.
* Incorrect output labeling: detections are shown with wrong labels or confidence values.
* Broken media workflow: users cannot process images or videos.
* Security failure: unsafe files, exposed secrets, or unvalidated input.
* CI failure: untested or broken changes merge into the main branch.

## B. Planned Types of Testing

### Unit Testing

Unit tests will use `pytest` and focus on deterministic logic that does not require loading large model files.

Current unit test targets include:

* Confidence threshold validation.
* Supported image/video extension checks.
* Media path validation.
* Output file path generation.
* Detection label formatting.
* Unknown class ID handling.

### Integration Testing

Integration tests will verify that major parts of the system work together.

Planned integration tests include:

* Media validation with real fixture files.
* Video processing with a short test video.
* Model inference wrapper with a sample image.
* Backend upload endpoint with media validation.
* Frontend-to-backend communication.

Full YOLO model tests should not run in every CI check because model files are large and inference can be slow. These tests should run manually or in a separate scheduled workflow.

### End-to-End Testing

Future E2E tests should cover complete user workflows, such as:

* Uploading an image and receiving an annotated result.
* Uploading a video and downloading the processed output.
* Viewing pothole detections on a map if a mapping interface is added.
* Filtering potholes by severity, status, date, or location if those features are added.

Recommended tools include Playwright for browser testing and a manual smoke test checklist for model demos.

### Performance and Load Testing

Performance testing is important because video processing and model inference can be slow.

Main performance risks include:

* Large videos taking too long to process.
* CPU-only machines running inference slowly.
* Large model files slowing CI.
* Future map data slowing frontend rendering.

Planned measurements include image inference time, video frame processing time, short video processing time, and CI runtime.

### Security Testing

Security testing will focus on media input, secrets, and safe file handling.

Security checks should include:

* Validating file existence and supported extensions.
* Avoiding unsafe user-controlled filenames.
* Keeping `.env`, credentials, tokens, and private keys out of Git.
* Reviewing dependency changes before merging.
* Keeping CI logs free of secrets.

## C. Pull Request Quality Rules

Pull requests must follow these rules:

* Pull requests must pass GitHub Actions before merging.
* Pull requests must pass Python linting.
* Pull requests must pass Python tests.
* At least one teammate must review each pull request.
* No direct pushes to `main`.
* Pull requests must describe what changed and how it was tested.
* New helper logic should include unit tests.
* Large model files should not be added unless the team agrees they are required.
* New user-facing behavior should include screenshots or demo notes.
