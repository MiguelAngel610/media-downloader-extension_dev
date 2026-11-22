"""yt-dlp through its Python API (no subprocess, no shell)."""
import os
from typing import Any, Dict

from md_host import host_log

try:
    import yt_dlp
    HAS_YTDLP = True
except ImportError:
    HAS_YTDLP = False


class YtDlpLogger:
    """Routes yt-dlp's own logging: only errors are worth keeping in host.log."""

    def debug(self, message: str) -> None:
        pass  # yt-dlp debug output is extremely verbose

    def info(self, message: str) -> None:
        pass  # informational lines are not needed

    def warning(self, message: str) -> None:
        pass  # warnings are noisy for Instagram DASH manifests

    def error(self, message: str) -> None:
        host_log.log_info(f"yt-dlp error output: {message}")


def _downloaded_filename(downloader: Any, info: Dict[str, Any]) -> str:
    entry = info["entries"][0] if info.get("entries") else info
    return os.path.basename(downloader.prepare_filename(entry))


def download(url: str, options: Dict[str, Any]) -> Dict[str, Any]:
    """Downloads `url` with yt-dlp's default best-quality format selection (bv*+ba/b)."""
    if not HAS_YTDLP:
        return {"status": "error", "message": "yt-dlp is not installed as a Python module. Run 'pip install yt-dlp'"}

    host_log.broadcast(f"Running native yt-dlp for URL: {url}")
    options = dict(options, quiet=True, no_warnings=True, logger=YtDlpLogger())
    try:
        with yt_dlp.YoutubeDL(options) as downloader:
            info = downloader.extract_info(url, download=True)
            result = {"status": "success", "message": "Downloaded natively with yt-dlp"}
            if info:
                result["filename"] = _downloaded_filename(downloader, info)
            return result
    except Exception as error:  # yt-dlp raises many unrelated types (DownloadError, ExtractorError, OSError...)
        host_log.broadcast(f"Native yt-dlp error: {error}")
        return {"status": "error", "message": str(error)}
