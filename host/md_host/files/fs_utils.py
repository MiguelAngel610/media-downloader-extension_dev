"""Small filesystem helpers whose failures are logged, never silently ignored."""
import os

from md_host.runtime import host_log


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
