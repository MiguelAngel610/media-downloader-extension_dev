"""Records which engine each request reaches and with exactly which URL/path/options (no network, fake home)."""
import json
import os
import re
import tempfile
from typing import Any, Callable, Dict, List

from routing_cases import CASES, GALLERY_CONFIG

_TEMP_DIR = os.path.normcase(os.path.realpath(tempfile.gettempdir()))


def make_fake_home() -> str:
    home = tempfile.mkdtemp(prefix="md_routing_")
    os.makedirs(os.path.join(home, "gallery-dl"))
    for cookie in ("www.instagram.com_cookiesM.txt", "www.instagram.com_cookiesV.txt", "www.x.com_cookies.txt", "www.facebook.com_cookies.txt"):
        open(os.path.join(home, "gallery-dl", cookie), "w").close()
    with open(os.path.join(home, "gallery-dl", "config.json"), "w", encoding="utf-8") as config:
        json.dump(GALLERY_CONFIG, config)
    return home


def normalize(value: Any, home: str) -> Any:
    """Machine-independent form: <HOME>, <TMP>, forward slashes, no local time-of-day."""
    if isinstance(value, dict):
        return {k: normalize(v, home) for k, v in sorted(value.items()) if k != "logger"}
    if isinstance(value, (list, tuple)):
        return [normalize(v, home) for v in value]
    if not isinstance(value, str):
        return value
    text = value.replace(home, "<HOME>").replace(home.replace("\\", "/"), "<HOME>")
    text = re.sub(r"file:///[^ ]*?\.mpd", "<TMP_MANIFEST_URI>", text)
    if os.path.normcase(os.path.realpath(os.path.dirname(text))) == _TEMP_DIR and text.endswith(".mpd"):
        text = "<TMP_MANIFEST>"
    text = text.replace("\\", "/")
    text = re.sub(r"_profile_pic_(\d{4}-\d{2}-\d{2})_\d{6}", r"_profile_pic_\1_<HMS>", text)
    return text


def capture_all(run_case: Callable[[Dict[str, Any]], Any], calls: List[Dict[str, Any]], home: str) -> Dict[str, Any]:
    out = {}
    for name, message in CASES:
        calls.clear()
        result = run_case(json.loads(json.dumps(message)))
        out[name] = {"calls": normalize(list(calls), home), "result": normalize(result, home)}
    return out
