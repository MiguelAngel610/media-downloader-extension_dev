"""Guards for untrusted input coming from web pages: filesystem path segments and URLs."""
import os
import re
import urllib.parse
from typing import Any, Dict

from md_host import host_log

_INVALID_CHARS = re.compile(r'[<>:"/\\|?*\x00-\x1f]')
_RESERVED_NAMES = frozenset({"CON", "PRN", "AUX", "NUL",
                             *(f"COM{i}" for i in range(1, 10)), *(f"LPT{i}" for i in range(1, 10))})
MAX_SEGMENT_LENGTH = 120
# Metadata fields that end up in folder names, file names or yt-dlp output templates.
PATH_METADATA_KEYS = ("username", "media_category", "tweet_id", "shortcode", "user_id")


class PathTraversalError(ValueError):
    """A computed output path would leave the gallery-dl directory."""


def sanitize_segment(value: Any, fallback: str) -> str:
    # Separators become '_', so the result can never contain '..\' or '/' traversal.
    text = _INVALID_CHARS.sub("_", str(value)).strip()
    text = text.rstrip(". ")  # Windows silently strips trailing dots/spaces from names
    if not text or set(text) == {"."}:
        return fallback
    if text.split(".")[0].upper() in _RESERVED_NAMES:
        text = "_" + text
    # '%' would be expanded by yt-dlp's output template engine.
    return text.replace("%", "_")[:MAX_SEGMENT_LENGTH]


def sanitize_metadata(metadata: Dict[str, Any]) -> Dict[str, Any]:
    sanitized = dict(metadata)
    for key in PATH_METADATA_KEYS:
        value = sanitized.get(key)
        if value is None or value == "":
            continue
        clean = sanitize_segment(value, "unknown")
        if clean != str(value):
            host_log.broadcast(f"PathGuard: sanitized metadata '{key}': {value!r} -> {clean!r}")
        sanitized[key] = clean
    return sanitized


def ensure_inside(base_dir: str, target: str) -> str:
    """Defense in depth: resolve both paths and require target to live under base_dir."""
    base_real = os.path.realpath(base_dir)
    target_real = os.path.realpath(target)
    try:
        inside = os.path.commonpath([base_real, target_real]) == base_real
    except ValueError:  # Different drives on Windows
        inside = False
    if not inside:
        raise PathTraversalError(f"Refusing to write outside {base_real}: {target_real}")
    return target


def is_safe_http_url(url: Any) -> bool:
    """Only absolute http(s) URLs may reach a downloader (blocks file://, options like '--exec=...', etc.)."""
    if not isinstance(url, str) or not url:
        return False
    try:
        parsed = urllib.parse.urlsplit(url)
    except ValueError:
        return False
    return parsed.scheme in ("http", "https") and bool(parsed.netloc)
