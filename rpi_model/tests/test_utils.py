from __future__ import annotations

# Unit tests for utility helpers.

import tempfile
import time
import unittest
from pathlib import Path

import utils


class CalculateFpsTests(unittest.TestCase):
    def test_calculate_fps_returns_positive_value(self) -> None:
        prev_time = time.time() - 0.25

        fps, current_time = utils.calculate_fps(prev_time)

        self.assertGreater(fps, 0.0)
        self.assertGreaterEqual(current_time, prev_time)

    def test_calculate_fps_handles_non_positive_elapsed_time(self) -> None:
        prev_time = time.time() + 1.0

        fps, current_time = utils.calculate_fps(prev_time)

        self.assertEqual(fps, 0.0)
        self.assertGreaterEqual(current_time, prev_time - 1.0)


class EnsureOutputDirTests(unittest.TestCase):
    def test_ensure_output_dir_creates_directory(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "outputs" / "nested"

            utils.ensure_output_dir(str(path))

            self.assertTrue(path.exists())
            self.assertTrue(path.is_dir())

    def test_ensure_output_dir_is_idempotent(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "outputs"
            path.mkdir()

            utils.ensure_output_dir(str(path))

            self.assertTrue(path.exists())
            self.assertTrue(path.is_dir())
