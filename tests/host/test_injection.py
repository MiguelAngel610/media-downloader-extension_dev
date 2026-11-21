import os, sys, subprocess, importlib.util
host_path, marker_dir = sys.argv[1], sys.argv[2]
spec = importlib.util.spec_from_file_location("host", host_path)
host = importlib.util.module_from_spec(spec); spec.loader.exec_module(host)
E = host.DownloaderEngines
host.Logger.log_info = staticmethod(lambda msg: None)  # keep host.log untouched

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
res = E.execute_gallery_dl(url, [])
results.append(("new code does NOT execute injected command", not os.path.exists(marker)))
results.append(("new code still reports gallery-dl result", res.get("status") in ("error", "success", "skipped")))
results.append(("option-looking URL rejected", E.execute_gallery_dl("--exec=calc", [])["message"] == "Rejected unsafe URL"))
results.append(("file:// URL rejected", not E.is_safe_http_url("file:///C:/Windows/win.ini")))
results.append(("normal https URL accepted", E.is_safe_http_url("https://www.instagram.com/p/ABC/?igsh=x&utm=y")))
results.append(("resolver uses python -m gallery_dl", E.resolve_gallery_dl_command()[1:] == ["-m", "gallery_dl"]))

for name, ok in results: print(("PASS" if ok else "FAIL") + "  " + name)
print(f"
{sum(ok for _, ok in results)}/{len(results)} passed")
sys.exit(0 if all(ok for _, ok in results) else 1)
