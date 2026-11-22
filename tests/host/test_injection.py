import os, sys, subprocess
host_path, marker_dir = sys.argv[1], sys.argv[2]
sys.path.insert(0, os.path.dirname(os.path.abspath(host_path)))
from md_host.engines import gallery_dl  # noqa: E402
from md_host.runtime import host_log  # noqa: E402
from md_host.security import url_safety  # noqa: E402
host_log.log_info = lambda msg: None  # keep host.log untouched

def payload(name):
    marker = os.path.join(marker_dir, name)
    if os.path.exists(marker): os.remove(marker)
    # Unsupported domain -> gallery-dl exits without any network request.
    return f"https://example.invalid/p/X/?a=1&echo.>{marker}", marker  # no spaces: list2cmdline adds no quotes

results = []
# Baseline: the OLD invocation style (list + shell=True) on Windows
url, marker = payload("old_pwned.txt")
subprocess.run([sys.executable, "-m", "gallery_dl", url], shell=True, capture_output=True)
results.append(("baseline old shell=True executes injected command", os.path.exists(marker)))

# NEW implementation
url, marker = payload("new_pwned.txt")
res = gallery_dl.download(url, [])
results.append(("new code does NOT execute injected command", not os.path.exists(marker)))
results.append(("new code still reports gallery-dl result", res.get("status") in ("error", "success", "skipped")))
results.append(("option-looking URL rejected", gallery_dl.download("--exec=calc", [])["message"] == "Rejected unsafe URL"))
results.append(("file:// URL rejected", not url_safety.is_safe_http_url("file:///C:/Windows/win.ini")))
results.append(("normal https URL accepted", url_safety.is_safe_http_url("https://www.instagram.com/p/ABC/?igsh=x&utm=y")))
results.append(("resolver uses python -m gallery_dl", gallery_dl.resolve_command()[1:] == ["-m", "gallery_dl"]))

for name, ok in results:
    print(("PASS" if ok else "FAIL") + "  " + name)
print(f"\n{sum(ok for _, ok in results)}/{len(results)} passed")
sys.exit(0 if all(ok for _, ok in results) else 1)
