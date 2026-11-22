"""Where files live (the gallery-dl folder, resolved at call time so tests can redirect the home
directory) and cleanup of temporary files, whose failures are logged, never silently ignored."""
import os

from md_host import host_log

GALLERY_DIR_NAME = "gallery-dl"


def gallery_dir() -> str:
    """The user's private gallery-dl folder: downloads, cookies, config and the bridge token live here."""
    return os.path.join(os.path.expanduser("~"), GALLERY_DIR_NAME)


def ensure_gallery_dir() -> str:
    path = gallery_dir()
    os.makedirs(path, exist_ok=True)
    return path


def remove_if_exists(path: str) -> None:
    """Cleanup helper: a missing file is fine, any other failure is logged."""
    try:
        os.remove(path)
    except FileNotFoundError:
        pass  # Nothing to clean up
    except OSError as error:
        host_log.log_info(f"Could not remove temporary file {path}: {error}")


def remove_part_files(directory: str, base_name: str) -> None:
    """Deletes '<base_name>*.part' leftovers from an interrupted yt-dlp run."""
    try:
        leftovers = [name for name in os.listdir(directory) if name.startswith(base_name) and name.endswith(".part")]
    except OSError as error:
        host_log.log_info(f"Could not list {directory} for .part cleanup: {error}")
        return
    for leftover in leftovers:
        remove_if_exists(os.path.join(directory, leftover))
