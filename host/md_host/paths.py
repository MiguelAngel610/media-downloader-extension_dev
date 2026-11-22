"""Locations shared by every module. Resolved at call time so tests can redirect the home directory."""
import os

GALLERY_DIR_NAME = "gallery-dl"


def gallery_dir() -> str:
    """The user's private gallery-dl folder: downloads, cookies, config and the bridge token live here."""
    return os.path.join(os.path.expanduser("~"), GALLERY_DIR_NAME)


def ensure_gallery_dir() -> str:
    path = gallery_dir()
    os.makedirs(path, exist_ok=True)
    return path
