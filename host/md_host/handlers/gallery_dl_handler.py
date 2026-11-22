"""Instagram page URLs (posts, carousels, blob fallbacks) through gallery-dl with the selected account's cookies."""
import os
from typing import Any, Dict, List

from md_host.engines import gallery_dl
from md_host.media_request import MediaRequest
from md_host import host_log
from md_host import security

COOKIE_FILES = {"M": "www.instagram.com_cookiesM.txt", "V": "www.instagram.com_cookiesV.txt"}
BACKUP_ROOT = "Bandeja_Favoritos"


def build_options(request: MediaRequest, gallery_dir: str) -> List[str]:
    options: List[str] = []
    config_path = os.path.join(gallery_dir, "config.json")
    if os.path.exists(config_path):
        options += ["--config", config_path]

    if request.meta("is_backup", False):
        host_log.broadcast("WARNING: Backup mode. Cookies DISABLED.")
        backup_dir = os.path.join(gallery_dir, BACKUP_ROOT, request.platform, "post", request.meta("username", "Unknown"))
        return options + ["-d", security.ensure_inside(gallery_dir, backup_dir)]

    cookie_path = os.path.join(gallery_dir, COOKIE_FILES.get(request.account, COOKIE_FILES["V"]))
    if os.path.exists(cookie_path):
        options += ["--cookies", cookie_path]
    return options


def handle(request: MediaRequest, gallery_dir: str) -> Dict[str, Any]:
    # gallery_dl.download appends '--' and the URL itself.
    return gallery_dl.download(request.url, build_options(request, gallery_dir))
