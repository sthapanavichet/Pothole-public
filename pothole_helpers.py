from pathlib import Path


SUPPORTED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}
SUPPORTED_VIDEO_EXTENSIONS = {".mp4", ".avi", ".mov", ".mkv"}


def validate_confidence_threshold(confidence: float) -> float:
    """Return a normalized confidence threshold or raise ValueError."""
    try:
        value = float(confidence)
    except (TypeError, ValueError) as exc:
        raise ValueError("Confidence threshold must be numeric.") from exc

    if not 0.0 <= value <= 1.0:
        raise ValueError("Confidence threshold must be between 0.0 and 1.0.")

    return value


def is_supported_media_path(path: str | Path, media_type: str) -> bool:
    """Check whether a path has a supported extension for the requested media type."""
    suffix = Path(path).suffix.lower()

    if media_type == "image":
        return suffix in SUPPORTED_IMAGE_EXTENSIONS
    if media_type == "video":
        return suffix in SUPPORTED_VIDEO_EXTENSIONS

    raise ValueError("media_type must be 'image' or 'video'.")


def validate_existing_media_path(path: str | Path, media_type: str) -> Path:
    """Validate that a media file exists and has a supported extension."""
    media_path = Path(path)

    if not media_path.is_file():
        raise FileNotFoundError(f"Media file not found: {media_path}")

    if not is_supported_media_path(media_path, media_type):
        raise ValueError(f"Unsupported {media_type} file extension: {media_path.suffix}")

    return media_path


def build_output_path(input_path: str | Path, output_dir: str | Path, suffix: str) -> Path:
    """Build an annotated output path while preserving the input extension."""
    input_media_path = Path(input_path)
    output_directory = Path(output_dir)
    clean_suffix = suffix.strip("_")
    return output_directory / f"{input_media_path.stem}_{clean_suffix}{input_media_path.suffix}"


def format_detection_labels(
    class_ids: list[int],
    confidences: list[float],
    class_names: dict[int, str],
    prefix: str | None = None,
) -> list[str]:
    """Format detection labels consistently for image and video annotations."""
    labels = []
    label_prefix = f"{prefix}:" if prefix else ""

    for class_id, confidence in zip(class_ids, confidences):
        class_name = class_names.get(int(class_id), str(class_id))
        labels.append(f"{label_prefix}{class_name} {float(confidence):.2f}")

    return labels
