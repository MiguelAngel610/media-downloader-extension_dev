"""Makes the downloader tools (gallery-dl, yt-dlp's ffmpeg) reachable when Chrome starts the host with a minimal PATH."""
import os
import sys
from typing import List

FFMPEG_EXECUTABLE = "ffmpeg.exe"


def _prepend_to_path(directory: str) -> None:
    current = os.environ.get("PATH", "")
    if directory not in current.split(os.pathsep):
        os.environ["PATH"] = directory + os.pathsep + current


def _winget_ffmpeg_dirs(packages_dir: str) -> List[str]:
    """First folder containing ffmpeg.exe inside each WinGet ffmpeg package."""
    found: List[str] = []
    for entry in os.listdir(packages_dir):
        if "ffmpeg" not in entry.lower():
            continue
        for root, _dirs, files in os.walk(os.path.join(packages_dir, entry)):
            if FFMPEG_EXECUTABLE in files:
                found.append(root)
                break
    return found


def inject_tool_paths() -> None:
    scripts_dir = os.path.join(os.path.dirname(sys.executable), "Scripts")
    if os.path.isdir(scripts_dir):
        _prepend_to_path(scripts_dir)

    winget_dir = os.path.join(os.path.expanduser("~"), "AppData", "Local", "Microsoft", "WinGet", "Packages")
    if os.path.isdir(winget_dir):
        for ffmpeg_dir in _winget_ffmpeg_dirs(winget_dir):
            _prepend_to_path(ffmpeg_dir)
