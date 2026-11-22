"""Filename templates (gallery-dl compatible subset) and collision handling."""
import datetime
import http.client
import json
import os
import re
import urllib.request
from typing import Any, Dict, Optional, Tuple

from md_host.runtime import host_log

DEFAULT_TEMPLATE = "{date:%Y-%m-%d}_{shortcode}.{extension}"
_WINDOWS_INVALID_CHARS = '<>:"/\\|?*'
_TEMPLATE_FIELDS = re.compile(r"\{(shortcode|sidecar_shortcode|extension|id|num)(\[:\d+\])?\}")
_DATE_FIELD = re.compile(r"\{date:([^}]+)\}")

SkipResult = Optional[Dict[str, Any]]


def load_template(gallery_dir: str, platform: str, has_index: bool) -> str:
    """The user's gallery-dl filename template for this platform (falls back to Instagram's, then the default)."""
    config_path = os.path.join(gallery_dir, "config.json")
    if not os.path.exists(config_path):
        return DEFAULT_TEMPLATE
    try:
        with open(config_path, "r", encoding="utf-8") as config_file:
            extractors = json.load(config_file).get("extractor", {})
    except (OSError, ValueError) as error:
        host_log.broadcast(f"Failed to read config: {error}")
        return DEFAULT_TEMPLATE
    configured = extractors.get(platform, extractors.get("instagram", {})).get("filename")
    if isinstance(configured, str):
        return configured
    if isinstance(configured, dict):
        default = configured.get("", DEFAULT_TEMPLATE)
        return configured.get("sidecar_shortcode", default) if has_index else default
    return DEFAULT_TEMPLATE


def _field_value(name: str, values: Dict[str, str]) -> str:
    return values["shortcode"] if name == "sidecar_shortcode" else values.get(name, "")


def _apply_slice(value: str, slice_spec: Optional[str]) -> str:
    if not slice_spec:
        return value
    try:
        return value[:int(slice_spec.strip("[:]"))]
    except ValueError:
        host_log.log_info(f"Ignored invalid filename template slice {slice_spec!r}")
        return value


def render(template: str, date: datetime.datetime, shortcode: str, safe_id: str, extension: str, index: Any) -> str:
    values = {"shortcode": shortcode or "", "extension": extension, "id": safe_id or "",
              "num": str(index) if index is not None else ""}
    filename = _DATE_FIELD.sub(lambda match: date.strftime(match.group(1)), template)
    filename = _TEMPLATE_FIELDS.sub(lambda match: _apply_slice(_field_value(match.group(1), values), match.group(2)), filename)

    if shortcode and safe_id == shortcode:  # avoid "<code>_<code>" when the id is the shortcode itself
        filename = filename.replace(f"_{shortcode}_{shortcode}", f"_{shortcode}").replace(f"{shortcode}_{shortcode}", shortcode)
    if index is not None and str(index).isdigit() and int(index) > 0 and "{num}" not in template:
        name, dot_ext = os.path.splitext(filename)
        filename = f"{name}_{index}{dot_ext}"
    for char in _WINDOWS_INVALID_CHARS:
        filename = filename.replace(char, "_")
    return filename


def get_remote_size(url: Optional[str]) -> int:
    """Content-Length from a HEAD request, or -1 when unknown."""
    if not url or url.startswith("blob:"):
        return -1
    try:
        request = urllib.request.Request(url, method="HEAD", headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(request, timeout=3) as response:
            return int(response.getheader("Content-Length", -1))
    except (OSError, ValueError, http.client.HTTPException) as error:
        host_log.log_info(f"Could not read remote size of {url[:80]}: {error}")
        return -1


def _skipped(path: str) -> Dict[str, Any]:
    return {"status": "skipped", "filename": os.path.basename(path)}


def resolve_unique_path(filepath: str, url: Optional[str], is_backup: bool) -> Tuple[str, SkipResult]:
    """
    (path to write, None) — or (existing path, skip result) when the same file is already on disk.
    Backups never re-download an existing name; manual downloads compare the remote size and add " (n)".
    """
    if not os.path.exists(filepath):
        return filepath, None
    if is_backup:
        return filepath, dict(_skipped(filepath), message="Already downloaded", log="File exists")

    remote_size = get_remote_size(url)
    name, dot_ext = os.path.splitext(filepath)
    candidate, counter = filepath, 0
    while os.path.exists(candidate):
        if remote_size > 0 and os.path.getsize(candidate) == remote_size:
            return candidate, _skipped(candidate)
        counter += 1
        candidate = f"{name} ({counter}){dot_ext}"
    return candidate, None
