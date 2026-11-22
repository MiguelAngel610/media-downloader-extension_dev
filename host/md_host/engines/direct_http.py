"""Plain HTTP download for direct CDN URLs, written atomically."""
import http.client
import os
import urllib.request
from typing import Any, Dict, Optional

from md_host import paths
from md_host import host_log
from md_host import security

TIMEOUT_SECONDS = 30
CHUNK_BYTES = 1024 * 1024
_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"


class IncompleteDownloadError(Exception):
    """The response ended before the declared size (or was empty)."""


def _declared_length(response: http.client.HTTPResponse) -> Optional[int]:
    declared = response.getheader("Content-Length")
    return int(declared) if declared and declared.isdigit() else None


def _stream_to_file(url: str, part_path: str) -> None:
    request = urllib.request.Request(url, headers={"User-Agent": _USER_AGENT})
    with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response, open(part_path, "wb") as out_file:
        expected_bytes = _declared_length(response)
        written = 0
        while chunk := response.read(CHUNK_BYTES):
            out_file.write(chunk)
            written += len(chunk)
    if written == 0:
        raise IncompleteDownloadError("server returned an empty body")
    if expected_bytes is not None and written != expected_bytes:
        raise IncompleteDownloadError(f"received {written} of {expected_bytes} bytes")


def download(url: str, filepath: str) -> Dict[str, Any]:
    """
    Streams into '<file>.part' and renames only once the byte count matches Content-Length.
    Writing straight to the final name left truncated files that later runs treated as
    "already downloaded" and never repaired.
    """
    if not security.is_safe_http_url(url):
        return {"status": "error", "message": "Rejected unsafe URL"}
    part_path = filepath + ".part"
    try:
        _stream_to_file(url, part_path)
        os.replace(part_path, filepath)
    except (OSError, http.client.HTTPException, IncompleteDownloadError) as error:
        # urllib.error.URLError and socket timeouts are OSError subclasses.
        paths.remove_if_exists(part_path)
        host_log.broadcast(f"STATUS: FAILED (Direct) {error}")
        return {"status": "error", "message": f"Direct download failed: {error}"}
    host_log.broadcast("STATUS: SUCCESS (Direct)")
    return {"status": "success", "message": "Downloaded via direct HTTP", "filename": os.path.basename(filepath)}
