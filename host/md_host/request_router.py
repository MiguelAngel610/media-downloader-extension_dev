"""Validates a download request, filters accidental duplicates and dispatches it to a handler."""
import threading
import time
from typing import Any, Callable, Dict, Optional

from md_host import paths
from md_host.handlers import direct_media, gallery_dl_handler, ytdlp_handler
from md_host.media_request import MediaRequest
from md_host import host_log
from md_host import security

Result = Dict[str, Any]
Handler = Callable[[MediaRequest, str], Result]

KNOWN_PLATFORMS = frozenset({"instagram", "facebook", "twitter", "auto"})
DIRECT_MEDIA_TYPE = "direct_story"
DUPLICATE_WINDOW_SECONDS = 3

# Page URLs: the platform decides which external downloader resolves them.
PAGE_HANDLERS: Dict[str, Handler] = {
    "instagram": gallery_dl_handler.handle,
    "twitter": ytdlp_handler.handle,
    "facebook": ytdlp_handler.handle,
}


class RecentRequests:
    """Drops the same request repeated within a few seconds (double clicks, shortcut + click)."""

    def __init__(self, window_seconds: float):
        self._window_seconds = window_seconds
        self._seen: Dict[str, float] = {}
        self._lock = threading.Lock()

    @staticmethod
    def key_for(request: MediaRequest) -> Optional[str]:
        shortcode = request.meta("shortcode")
        if request.url:
            return f"blob_fallback_{shortcode}" if request.url.startswith("blob:") and shortcode else request.url
        return f"dash_{shortcode}_{request.meta('index', '0')}"

    def is_duplicate(self, request: MediaRequest) -> bool:
        key = self.key_for(request)
        now = time.time()
        with self._lock:
            # Old entries are pruned so the cache never grows for the whole browser session.
            self._seen = {k: t for k, t in self._seen.items() if now - t < self._window_seconds}
            if key in self._seen:
                return True
            self._seen[key] = now
            return False

    def clear(self) -> None:
        with self._lock:
            self._seen.clear()


RECENT_REQUESTS = RecentRequests(DUPLICATE_WINDOW_SECONDS)


def dispatch(request: MediaRequest) -> Result:
    if not request.url and not request.meta("dash_manifest"):
        return {"status": "error", "message": "No URL provided"}
    if RECENT_REQUESTS.is_duplicate(request):
        host_log.broadcast("STATUS: SKIPPED (URL duplicated within 3s)")
        return {"status": "skipped", "message": "Already downloaded in RAM cache"}

    gallery_dir = paths.ensure_gallery_dir()
    if request.media_type == DIRECT_MEDIA_TYPE:
        return direct_media.handle(request, gallery_dir, redispatch=dispatch)
    handler = PAGE_HANDLERS.get(request.platform)
    if handler is None:
        return {"status": "error", "message": "Unknown platform"}
    return handler(request, gallery_dir)


def process_request(message: Dict[str, Any]) -> Result:
    """Entry point for every message that carries a 'url'. Sanitizes metadata once, then dispatches."""
    platform = message.get("platform") or "auto"
    if platform not in KNOWN_PLATFORMS:
        host_log.broadcast(f"Rejected request with unknown platform: {platform!r}")
        return {"status": "error", "message": "Unknown platform"}

    raw_metadata = message.get("direct_metadata") or message.get("metadata") or {}
    if not isinstance(raw_metadata, dict):
        return {"status": "error", "message": "Invalid metadata"}

    request = MediaRequest.from_message(message, security.sanitize_metadata(raw_metadata))
    try:
        return dispatch(request)
    except security.PathTraversalError as error:
        host_log.broadcast(f"SECURITY: {error}")
        return {"status": "error", "message": "Rejected unsafe output path"}
