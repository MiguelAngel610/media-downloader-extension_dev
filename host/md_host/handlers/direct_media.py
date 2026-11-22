"""Direct media: the extension already resolved the CDN URL and/or the DASH manifest.

Pipeline: name the file -> choose the folder -> skip duplicates -> DASH via yt-dlp (best quality)
-> plain HTTP -> for blob: URLs, hand the post/story page back to the generic downloader.
"""
import json
import os
import pathlib
import tempfile
import time
from typing import Any, Callable, Dict, Optional

from md_host import filenames, fs_utils, host_log, path_guard, timestamps
from md_host.engines import direct_http, ytdlp
from md_host.media_request import MediaRequest

Result = Dict[str, Any]
Redispatch = Callable[[MediaRequest], Result]

BACKUP_ROOT = "Bandeja_Favoritos"


def _extension(request: MediaRequest) -> str:
    url = str(request.url)
    is_video = request.meta("dash_manifest") or request.meta("is_video") or ".mp4" in url or "video" in url
    return "mp4" if is_video else "jpg"


def _shortcode(request: MediaRequest) -> str:
    shortcode = request.meta("shortcode")
    if shortcode:
        return shortcode
    media_id = request.meta("media_id")
    return str(media_id).split("_")[0] if media_id else str(int(time.time()))


def _safe_id(media_id: Any, shortcode: str) -> str:
    if not media_id:
        return shortcode
    return str(media_id).split("_")[0] if str(media_id).isdigit() else str(media_id)


def build_filename(request: MediaRequest, gallery_dir: str, shortcode: str, extension: str) -> str:
    date = timestamps.to_local_datetime(timestamps.resolve_timestamp(request.metadata))
    username = request.meta("username", "Direct_Stories")
    if shortcode == "profile_pic":
        return f"{username}_profile_pic_{date.strftime('%Y-%m-%d_%H%M%S')}.{extension}"
    template = filenames.load_template(gallery_dir, request.platform, has_index=bool(request.meta("index")))
    return filenames.render(template, date, shortcode, _safe_id(request.meta("media_id"), shortcode), extension, request.meta("index"))


def output_dir(request: MediaRequest, gallery_dir: str, extension: str) -> str:
    username = request.meta("username", "Direct_Stories")
    category = request.meta("media_category", "post")
    if request.meta("is_backup", False):
        subfolder = "" if category == "pfp" else category
        parts = [gallery_dir, BACKUP_ROOT, request.platform] + ([subfolder] if subfolder else []) + [username]
        return os.path.join(*parts)
    if request.platform == "facebook":
        kind = "Videos" if (request.meta("is_video", False) or extension == "mp4") else "Pictures"
        return os.path.join(gallery_dir, request.platform, username, kind)
    return os.path.join(gallery_dir, request.platform, username)


def write_user_id_file(directory: str, request: MediaRequest) -> None:
    """Facebook usernames change; a permanent numeric id file keeps the folder traceable."""
    user_id = request.meta("user_id")
    if not user_id:
        return
    user_root = os.path.dirname(directory) if directory.endswith(("Videos", "Pictures")) else directory
    id_file_path = os.path.join(user_root, f"ID_{user_id}.txt")
    if os.path.exists(id_file_path):
        return
    username = request.meta("username", "Direct_Stories")
    try:
        with open(id_file_path, "w", encoding="utf-8") as id_file:
            id_file.write(f"Username: {username}\nPermanent ID: {user_id}\nProfile URL: https://www.facebook.com/profile.php?id={user_id}\n")
    except OSError as error:
        host_log.broadcast(f"Could not write user ID file {id_file_path}: {error}")


def download_dash(manifest: str, filepath: str) -> Optional[Result]:
    """Best-quality DASH download (yt-dlp merges best video + best audio). None means 'try the next strategy'."""
    host_log.broadcast("DASH manifest found. Using NATIVE yt-dlp.")
    with tempfile.NamedTemporaryFile(delete=False, suffix=".mpd") as manifest_file:
        manifest_file.write(manifest.encode("utf-8"))
    base_path = os.path.splitext(filepath)[0]
    options = {
        "enable_file_urls": True,
        "outtmpl": base_path + ".%(ext)s",
        "merge_output_format": "mp4",
        "updatetime": False,  # Avoids Windows Errno 22 when the server sends an invalid modification date
    }
    result = ytdlp.download(pathlib.Path(manifest_file.name).as_uri(), options)
    fs_utils.remove_if_exists(manifest_file.name)
    fs_utils.remove_if_exists(base_path + ".mpd")
    if result["status"] == "success":
        return result
    fs_utils.remove_part_files(os.path.dirname(filepath), os.path.basename(base_path))
    host_log.broadcast("NATIVE DASH fallback failed. Continuing to direct URL fallback...")
    return None


def blob_fallback_url(request: MediaRequest, shortcode: str) -> Optional[str]:
    """Page URL the generic downloader can resolve when the page only exposed a blob: stream."""
    if request.platform == "instagram":
        if shortcode and not shortcode.isdigit():
            return f"https://www.instagram.com/p/{shortcode}/"
        media_id = request.meta("media_id")
        if media_id:
            return f"https://www.instagram.com/stories/{request.meta('username', 'Direct_Stories')}/{str(media_id).split('_')[0]}/"
        return None
    if request.platform == "facebook":
        return request.meta("story_url") or (f"https://www.facebook.com/reel/{shortcode}" if shortcode else None)
    return None


def handle(request: MediaRequest, gallery_dir: str, redispatch: Redispatch) -> Result:
    host_log.broadcast(f"Raw metadata received: {json.dumps(request.metadata)}")
    shortcode = _shortcode(request)
    extension = _extension(request)
    directory = path_guard.ensure_inside(gallery_dir, output_dir(request, gallery_dir, extension))
    os.makedirs(directory, exist_ok=True)
    write_user_id_file(directory, request)

    target = os.path.join(directory, build_filename(request, gallery_dir, shortcode, extension))
    host_log.broadcast("--- NEW DIRECT DOWNLOAD REQUEST ---")
    host_log.broadcast(f"Target filepath: {target}")
    filepath, skip_result = filenames.resolve_unique_path(target, request.url, request.meta("is_backup", False))
    if skip_result:
        return skip_result
    host_log.broadcast(f"Direct downloading to: {filepath}")

    manifest = request.meta("dash_manifest")
    if manifest:
        dash_result = download_dash(manifest, filepath)
        if dash_result:
            return dash_result

    if request.url and not request.url.startswith("blob:"):
        return direct_http.download(request.url, filepath)

    fallback_url = blob_fallback_url(request, shortcode)
    if not fallback_url:
        return {"status": "error", "message": "Failed DASH download, cannot fallback to blob"}
    host_log.broadcast(f"Blob URL detected. Falling back: {fallback_url}")
    return redispatch(request.with_fallback_url(fallback_url))
