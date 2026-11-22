"""URL validation shared by every engine that hands a URL to an external tool."""
import urllib.parse
from typing import Any


def is_safe_http_url(url: Any) -> bool:
    """Only absolute http(s) URLs may reach a downloader (blocks file://, options like '--exec=...', etc.)."""
    if not isinstance(url, str) or not url:
        return False
    try:
        parsed = urllib.parse.urlsplit(url)
    except ValueError:
        return False
    return parsed.scheme in ("http", "https") and bool(parsed.netloc)
