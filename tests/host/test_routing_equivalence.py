"""Characterization (golden master) test for the md_host package split.

tests/host/fixtures/routing_golden.json was recorded from the ORIGINAL monolithic host.py: for every
request in routing_cases.CASES it stores which engine was called and with exactly which URL, output
path and options. The refactored package must reproduce every call byte for byte.
"""
import json
import os
import sys

host_path = sys.argv[1]
tests_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(os.path.abspath(host_path)))
sys.path.insert(0, tests_dir)
from md_host.engines import direct_http, gallery_dl, ytdlp  # noqa: E402
from md_host.routing import request_router  # noqa: E402
from md_host.runtime import host_log  # noqa: E402
from routing_capture import capture_all, make_fake_home  # noqa: E402

home = make_fake_home()
real_expanduser = os.path.expanduser
os.path.expanduser = lambda p: p.replace("~", home, 1) if p.startswith("~") else real_expanduser(p)
host_log.log_info = lambda msg: None
host_log.broadcast = lambda msg: None

calls = []
ok = {"status": "success", "message": "captured"}
direct_http.download = lambda url, filepath: calls.append({"engine": "direct_http", "url": url, "arg": filepath}) or dict(ok)
ytdlp.download = lambda url, options: calls.append({"engine": "ytdlp", "url": url, "arg": dict(options)}) or dict(ok)
gallery_dl.download = lambda url, options: calls.append({"engine": "gallery_dl", "url": url, "arg": list(options)}) or dict(ok)


def run_case(message):
    request_router.RECENT_REQUESTS.clear()
    return request_router.process_request(message)


with open(os.path.join(tests_dir, "fixtures", "routing_golden.json"), encoding="utf-8") as golden_file:
    golden = json.load(golden_file)
actual = capture_all(run_case, calls, home)

failures = 0
for name in golden:
    same = actual.get(name) == golden[name]
    failures += not same
    print(("PASS  " if same else "FAIL  ") + name)
    if not same:
        print(f"      expected: {json.dumps(golden[name], sort_keys=True)}")
        print(f"      actual:   {json.dumps(actual.get(name), sort_keys=True)}")
print(f"\n{len(golden) - failures}/{len(golden)} passed")
sys.exit(1 if failures else 0)
