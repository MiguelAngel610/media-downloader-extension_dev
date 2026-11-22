"""gallery-dl as a child process, hardened against command and argument injection."""
import importlib.util
import os
import re
import shutil
import subprocess
import sys
from typing import Any, Dict, List, NamedTuple, Optional

from md_host import host_log, url_safety

TIMEOUT_SECONDS = 45
_CREATE_NO_WINDOW = 0x08000000
_ANSI_ESCAPE = re.compile(r"\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])")


def resolve_command() -> Optional[List[str]]:
    """
    Prefer `python -m gallery_dl` from this same interpreter: it needs no PATH lookup and never
    goes through a .bat/.cmd shim, which Windows runs via cmd.exe even with shell=False (CPython gh-114539).
    """
    if importlib.util.find_spec("gallery_dl") is not None:
        return [sys.executable, "-m", "gallery_dl"]
    executable = shutil.which("gallery-dl")
    if executable and executable.lower().endswith(".exe"):
        return [executable]
    return None


def is_skip_output(text: str) -> bool:
    """gallery-dl prints '# <path>' (or 'skip'/'already exists') for files it did not download again."""
    if not text:
        return False
    lowered = text.lower()
    if "already exists" in lowered or "skip" in lowered:
        return True
    return any(_ANSI_ESCAPE.sub("", line).strip().startswith("#") for line in text.split("\n"))


def _last_output_filename(stdout: str) -> Optional[str]:
    lines = [line.strip() for line in stdout.strip().split("\n") if line.strip()]
    if not lines:
        return None
    last_line = lines[-1][2:] if lines[-1].startswith("# ") else lines[-1]
    return os.path.basename(last_line)


class RunOutcome(NamedTuple):
    returncode: int
    stdout: str
    stderr: str
    timed_out: bool


def _run(command: List[str]) -> RunOutcome:
    child_env = dict(os.environ, PYTHONIOENCODING="utf-8")  # Non-ASCII filenames must not crash the child
    process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                               creationflags=_CREATE_NO_WINDOW, cwd=os.path.expanduser("~"),
                               text=True, encoding="utf-8", errors="replace", env=child_env, shell=False)
    try:
        stdout, stderr = process.communicate(timeout=TIMEOUT_SECONDS)
        return RunOutcome(process.returncode, stdout, stderr, timed_out=False)
    except subprocess.TimeoutExpired:
        process.kill()
        stdout, stderr = process.communicate()
        return RunOutcome(process.returncode, stdout, stderr, timed_out=True)


def download(url: str, option_args: List[str]) -> Dict[str, Any]:
    if not url_safety.is_safe_http_url(url):
        host_log.broadcast(f"Rejected non-http(s) URL for gallery-dl: {url!r}")
        return {"status": "error", "message": "Rejected unsafe URL"}

    base_command = resolve_command()
    if base_command is None:
        return {"status": "error", "message": "gallery-dl is not installed. Run 'pip install gallery-dl'"}

    # shell=False: arguments go straight to CreateProcess, so '&', '|' or '>' in a URL can never become
    # shell commands. '--' stops option parsing: a URL such as '--exec=...' is never read as an option.
    command = base_command + option_args + ["--", url]
    host_log.broadcast(f"Executing gallery-dl: {command!r}")

    outcome = _run(command)
    if outcome.timed_out:
        host_log.broadcast(f"gallery-dl timed out after {TIMEOUT_SECONDS}s and was killed")
        return {"status": "error", "message": f"gallery-dl timed out after {TIMEOUT_SECONDS}s", "log": outcome.stderr}
    if outcome.returncode != 0:
        return {"status": "error", "message": "Gallery-dl failed", "log": outcome.stderr}
    if is_skip_output(outcome.stdout + outcome.stderr):
        return {"status": "skipped", "message": "Skipped by gallery-dl output"}

    result = {"status": "success", "message": "IG downloaded (gallery-dl)", "log": outcome.stdout}
    filename = _last_output_filename(outcome.stdout)
    if filename:
        result["filename"] = filename
    return result
