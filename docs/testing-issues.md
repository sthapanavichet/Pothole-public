# Testing and QA GitHub Issue Backlog

Use these issues as the testing-related GitHub Issues required for the workshop submission.

## 1. Add pytest coverage for media processing helpers

Add and maintain pytest coverage for deterministic media processing helper logic, including confidence threshold validation, media path validation, output path generation, and detection label formatting.

Acceptance criteria:

- `pytest` passes locally and in GitHub Actions.
- Tests avoid loading large model weights.
- Tests cover invalid inputs and expected successful cases.

## 2. Configure GitHub Actions CI pipeline

Configure a GitHub Actions workflow that runs automatically on push and pull request events.

Acceptance criteria:

- Workflow is stored at `.github/workflows/ci.yml`.
- Workflow checks out the repository.
- Workflow installs Python QA dependencies.
- Workflow runs ruff and pytest.
- Workflow completes successfully on GitHub.

## 3. Add ruff linting for Python scripts

Use ruff as the Python static analysis tool for CI and local QA.

Acceptance criteria:

- `pyproject.toml` contains ruff configuration.
- `ruff check .` passes locally.
- The same ruff command runs in GitHub Actions.

## 4. Add sample media smoke test checklist

Create a repeatable manual smoke test checklist for pothole detection demo workflows.

Acceptance criteria:

- Checklist covers sample image processing.
- Checklist covers sample video processing.
- Checklist records expected result and pass/fail status.
- Checklist includes visual verification of detection boxes and labels.

## 5. Add model inference integration test with fixture image

Add an integration test or manual test procedure for a small fixture image after model code is added.

Acceptance criteria:

- Test uses a known fixture image.
- Test documents expected model behavior.
- Test avoids large model loading in every pull request unless a lightweight model is available.

## 6. Add Playwright E2E tests if a frontend is added

Add end-to-end tests for future browser workflows.

Acceptance criteria:

- Test opens the frontend app.
- Test verifies the primary page renders.
- Test verifies an upload or filtering workflow once implemented.

## 7. Document QA strategy in /docs/QA.md

Create a project-specific QA document for the capstone testing and CI/CD workshop.

Acceptance criteria:

- Document includes testing goals.
- Document includes project risks and critical failure types.
- Document includes smoke, unit, integration, E2E, performance, and security testing plans.
- Document includes pull request quality rules.
- Document includes team QA responsibilities.

## 8. Add CI badge to README

Add a GitHub Actions CI badge to the root README so contributors can quickly see whether the latest workflow run is passing.

Acceptance criteria:

- README includes a badge for `.github/workflows/ci.yml`.
- Badge links to the repository Actions workflow page.
- Badge renders correctly on GitHub.
