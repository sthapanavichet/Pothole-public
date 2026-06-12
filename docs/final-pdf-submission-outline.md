# Final PDF Submission Outline

Use this outline to assemble the single PDF required by the workshop.

## 1. Testing Strategy Document - QA.md

Include the full contents of:

```text
docs/QA.md
```

This section satisfies the 4.0 mark testing strategy requirement.

## 2. GitHub Actions Workflow File

Include the full contents of:

```text
.github/workflows/ci.yml
```

This section satisfies the 3.0 mark CI/CD workflow requirement.

## 3. Screenshots of Successful CI/CD Runs

After pushing these files to GitHub, open:

```text
https://github.com/SED800/Pothole/actions/workflows/ci.yml
```

Capture screenshots showing:

- The workflow run completed successfully.
- The `Python Tests and Static Analysis` job passed.
- The job logs show `ruff check .` and `pytest tests -p no:cacheprovider`.

This section satisfies the 1.0 mark CI/CD screenshot requirement.

## 4. Testing-Related GitHub Issues

Create issues from:

```text
docs/testing-issues.md
```

Capture screenshots showing the created issues in the repository Issues tab.

This section satisfies the 2.0 mark GitHub Issues requirement.

## 5. Professional Formatting Checklist

Before exporting the PDF:

- Use clear headings.
- Keep artifacts in the required order.
- Add captions under screenshots.
- Make sure Markdown renders correctly on GitHub.
- Make sure screenshots are readable.
- Include the repository name and project title on the first page.
- Include the date and team name if required by the instructor.

## Local Verification Results

The following checks should pass locally before submission:

```text
pytest
ruff check .
```

Expected local result:

- `pytest`: 12 passed.
- `ruff check .`: all checks passed.
