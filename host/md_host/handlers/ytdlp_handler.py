"""Facebook and X/Twitter page URLs through yt-dlp."""
import os
import tempfile
from typing import Any, Dict, Optional, Tuple

from md_host.engines import ytdlp
from md_host import paths, timestamps
from md_host.media_request import MediaRequest
from md_host import security

BACKUP_ROOT = "Bandeja_Favoritos"
COOKIE_FILES = {"twitter": "www.x.com_cookies.txt", "facebook": "www.facebook.com_cookies.txt"}
VIDEO_MEDIA_TYPES = ("video", "auto")


def resolve_source(request: MediaRequest) -> Tuple[Optional[str], Optional[str]]:
    """(URL for yt-dlp, temporary manifest path to delete afterwards or None)."""
    source = request.url
    temp_manifest: Optional[str] = None
    if request.meta("is_direct"):
        if request.meta("url"):
            source = request.meta("url")
        elif request.meta("dash_manifest"):
            with tempfile.NamedTemporaryFile(delete=False, suffix=".mpd") as manifest_file:
                manifest_file.write(request.meta("dash_manifest").encode("utf-8"))
            source = temp_manifest = manifest_file.name

    looks_like_media_url = source and ("facebook.com" in source or "fbcdn.net" in source or source.startswith("http"))
    if not looks_like_media_url and request.meta("story_url"):
        source = request.meta("story_url")
    return source, temp_manifest


def _facebook_template(request: MediaRequest, gallery_dir: str) -> str:
    timestamp = timestamps.resolve_timestamp(request.metadata)
    date_str = timestamps.to_local_datetime(timestamp).strftime("%Y-%m-%d")
    shortcode = request.meta("shortcode", "")
    filename = f"{date_str}_{shortcode}.%(ext)s" if shortcode and shortcode != "story" else f"{date_str}_{timestamp}.%(ext)s"
    username = request.meta("username", "Unknown")
    if request.meta("is_backup", False):
        return os.path.join(gallery_dir, BACKUP_ROOT, "facebook", "post", username, filename)
    media_type = request.meta("mediaType", request.media_type)
    subfolder = "Videos" if media_type in VIDEO_MEDIA_TYPES else "Pictures"
    return os.path.join(gallery_dir, "facebook", username, subfolder, filename)


def output_template(request: MediaRequest, gallery_dir: str) -> str:
    if request.platform == "facebook":
        return _facebook_template(request, gallery_dir)
    platform_dir = os.path.join(gallery_dir, request.platform.capitalize())
    if request.meta("is_direct") and request.meta("tweet_id"):
        return os.path.join(platform_dir, f"X_{request.meta('tweet_id')}.%(ext)s")
    if request.meta("is_backup", False):
        platform_dir = os.path.join(gallery_dir, BACKUP_ROOT, request.platform, "post", request.meta("username", "Unknown"))
    return os.path.join(platform_dir, "%(title)s.%(ext)s")


def cookie_file(request: MediaRequest, gallery_dir: str) -> Optional[str]:
    filename = COOKIE_FILES.get(request.platform)
    if not filename or (request.platform == "twitter" and request.meta("is_direct")):
        return None
    path = os.path.join(gallery_dir, filename)
    return path if os.path.exists(path) else None


def handle(request: MediaRequest, gallery_dir: str) -> Dict[str, Any]:
    source, temp_manifest = resolve_source(request)
    template = output_template(request, gallery_dir)
    security.ensure_inside(gallery_dir, os.path.dirname(template))
    options: Dict[str, Any] = {"outtmpl": template}
    cookies = cookie_file(request, gallery_dir)
    if cookies:
        options["cookiefile"] = cookies
    try:
        return ytdlp.download(source, options)
    finally:
        if temp_manifest:
            paths.remove_if_exists(temp_manifest)
