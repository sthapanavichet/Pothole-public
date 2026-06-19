from pathlib import Path

import pytest

from pothole_helpers import (
    build_output_path,
    format_detection_labels,
    is_supported_media_path,
    validate_confidence_threshold,
    validate_existing_media_path,
)


def test_validate_confidence_threshold_accepts_boundary_values():
    assert validate_confidence_threshold(0) == 0.0
    assert validate_confidence_threshold("0.35") == 0.35
    assert validate_confidence_threshold(1) == 1.0


@pytest.mark.parametrize("value", [-0.1, 1.1, "high", None])
def test_validate_confidence_threshold_rejects_invalid_values(value):
    with pytest.raises(ValueError):
        validate_confidence_threshold(value)


def test_is_supported_media_path_checks_expected_extensions():
    assert is_supported_media_path("road.JPG", "image")
    assert is_supported_media_path("dashcam.mp4", "video")
    assert not is_supported_media_path("notes.txt", "image")
    assert not is_supported_media_path("frame.png", "video")


def test_is_supported_media_path_rejects_unknown_media_type():
    with pytest.raises(ValueError):
        is_supported_media_path("road.jpg", "audio")


def test_validate_existing_media_path_returns_path_for_valid_file(tmp_path):
    sample = tmp_path / "road_frame.png"
    sample.write_bytes(b"fake image bytes")

    assert validate_existing_media_path(sample, "image") == sample


def test_validate_existing_media_path_rejects_missing_file(tmp_path):
    with pytest.raises(FileNotFoundError):
        validate_existing_media_path(tmp_path / "missing.mp4", "video")


def test_build_output_path_preserves_stem_and_extension():
    output_path = build_output_path("samples/road_clip.mp4", "video_output", "annotated")

    assert output_path == Path("video_output") / "road_clip_annotated.mp4"


def test_format_detection_labels_uses_class_names_and_confidence_rounding():
    labels = format_detection_labels(
        class_ids=[0, 2],
        confidences=[0.953, 0.421],
        class_names={0: "Pothole", 2: "Crack"},
    )

    assert labels == ["Pothole 0.95", "Crack 0.42"]


def test_format_detection_labels_supports_prefix_and_unknown_class():
    labels = format_detection_labels(
        class_ids=[7],
        confidences=[0.8],
        class_names={},
        prefix="M1",
    )

    assert labels == ["M1:7 0.80"]
