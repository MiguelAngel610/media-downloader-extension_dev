"""Regression tests for host.py security fixes A (path traversal), B (TCP auth), C (stdout lock)."""
import contextlib
import importlib.util
import io
import json
import os
import socket
import struct
import sys
import tempfile
import threading
import time

host_path = sys.argv[1]
spec = importlib.util.spec_from_file_location("host", host_path)
host = importlib.util.module_from_spec(spec)
spec.loader.exec_module(host)

results = []
def check(name, ok):
    results.append((name, bool(ok)))

# Isolate: fake home directory, no writes to the real host.log
fake_home = tempfile.mkdtemp(prefix="md_host_test_")
real_expanduser = os.path.expanduser
host.os.path.expanduser = lambda p: p.replace("~", fake_home, 1) if p.startswith("~") else real_expanduser(p)
host.Logger.log_info = staticmethod(lambda msg: None)
gallery_dir = os.path.join(fake_home, "gallery-dl")

# ---------------------------------------------------------------- A: path traversal
written_paths = []
host.DownloaderEngines.execute_direct_http = staticmethod(
    lambda url, filepath: written_paths.append(filepath) or {"status": "success", "filename": os.path.basename(filepath)})

def direct_story(metadata, platform="instagram"):
    written_paths.clear()
    host.MediaManager.downloaded_urls_cache.clear()
    msg = {"url": f"https://example.invalid/{time.time_ns()}.jpg", "mediaType": "direct_story", "platform": platform,
           "direct_metadata": dict({"timestamp": 1700000000, "shortcode": "ABC123"}, **metadata)}
    return host.MediaManager.process_request(msg, platform, "M", "direct_story"), list(written_paths)

def is_inside(path):
    return os.path.commonpath([os.path.realpath(gallery_dir), os.path.realpath(path)]) == os.path.realpath(gallery_dir)

res, paths = direct_story({"username": "..\\..\\..\\AppData\\Roaming\\evil"})
check("A1 traversal username stays inside gallery-dl", paths and all(is_inside(p) for p in paths))
res, paths = direct_story({"username": "../../etc", "media_category": "..\\..\\x", "is_backup": True})
check("A2 traversal media_category (backup) stays inside", paths and all(is_inside(p) for p in paths))
res, paths = direct_story({"username": "danyancat"})
check("A3 normal username unchanged", paths and os.path.join("instagram", "danyancat") in paths[0])
res, paths = direct_story({"username": "user.name_1"})
check("A4 username with dot/underscore unchanged", paths and os.path.join("instagram", "user.name_1") in paths[0])
res, paths = direct_story({"username": "CON"})
check("A5 Windows reserved name is neutralized", paths and os.path.join("instagram", "_CON") in paths[0])
res, _ = direct_story({"username": "x"}, platform="..\\..\\evil")
check("A6 unknown platform rejected", res.get("message") == "Unknown platform")
check("A7 sanitize_segment('..') falls back", host.PathGuard.sanitize_segment("..", "unknown") == "unknown")
try:
    host.PathGuard.ensure_inside(gallery_dir, os.path.join(gallery_dir, "..", "outside"))
    check("A8 ensure_inside rejects escaping path", False)
except host.PathTraversalError:
    check("A8 ensure_inside rejects escaping path", True)

# ---------------------------------------------------------------- B: TCP bridge auth
forwarded = []
host.NativeMessaging.send_message = classmethod(lambda cls, m: forwarded.append(m))

with socket.socket() as probe:
    probe.bind(("127.0.0.1", 0))
    port = probe.getsockname()[1]
server = host.TCPServer(port=port)
server.start()
time.sleep(0.3)
token = open(os.path.join(gallery_dir, "md_bridge_token.txt"), encoding="utf-8").read().strip()
check("B0 token file generated (>= 40 chars)", len(token) >= 40)

def session(lines, raw_chunks=None, wait=0.3, read_logs=False):
    forwarded.clear()
    s = socket.create_connection(("127.0.0.1", port), timeout=2)
    for chunk in (raw_chunks or [(json.dumps(l) + "\n").encode() for l in lines]):
        s.sendall(chunk)
        time.sleep(0.05)
    time.sleep(wait)
    received = b""
    if read_logs:
        host.Logger.broadcast_log("hello-log-line")
        s.settimeout(1)
        try:
            received = s.recv(4096)
        except (socket.timeout, ConnectionError):
            pass
    s.close()
    time.sleep(0.1)
    return list(forwarded), received

fwd, _ = session([{"action": "stop_backup"}])
check("B1 no auth -> command not forwarded", fwd == [])
fwd, _ = session([{"action": "auth", "token": "wrong"}, {"action": "stop_backup"}])
check("B2 wrong token -> command not forwarded", fwd == [])
fwd, _ = session([{"action": "auth", "token": token}, {"action": "stop_backup"}])
check("B3 valid token -> stop_backup forwarded", fwd == [{"action": "stop_backup"}])
fwd, _ = session([{"action": "auth", "token": token}, {"action": "evil_action"}, {"action": "stop_backup"}])
check("B4 unknown action dropped, allowed one still forwarded", fwd == [{"action": "stop_backup"}])
auth = (json.dumps({"action": "auth", "token": token}) + "\n").encode()
fwd, _ = session(None, raw_chunks=[auth, b'{"action": "stop_', b'backup"}\n'])
check("B5 JSON split across two sends is reassembled", fwd == [{"action": "stop_backup"}])
fwd, _ = session(None, raw_chunks=[auth, b'{"action": "stop_backup"}'])
check("B6 last message without newline processed on close", fwd == [{"action": "stop_backup"}])
_, logs = session([{"action": "auth", "token": token}], read_logs=True)
check("B7 authenticated client receives logs", b"hello-log-line" in logs)
_, logs = session([], read_logs=True, wait=0.1)
check("B8 unauthenticated client receives no logs", b"hello-log-line" not in logs)

# ---------------------------------------------------------------- C: stdout frame integrity
class SlowBuffer(io.BytesIO):
    def write(self, data):
        time.sleep(0.0002)  # widen the race window between length and body writes
        return super().write(data)

class FakeStdout:
    def __init__(self):
        self.buffer = SlowBuffer()

def parse_frames(raw):
    frames, offset = [], 0
    while offset + 4 <= len(raw):
        (length,) = struct.unpack("@I", raw[offset:offset + 4])
        body = raw[offset + 4: offset + 4 + length]
        offset += 4 + length
        try:
            frames.append(json.loads(body.decode("utf-8")))
        except (UnicodeDecodeError, json.JSONDecodeError):
            return frames, False
    return frames, offset == len(raw)

def hammer(use_lock):
    spec2 = importlib.util.spec_from_file_location("host_fresh", host_path)
    fresh = importlib.util.module_from_spec(spec2)
    spec2.loader.exec_module(fresh)
    if not use_lock:
        fresh.NativeMessaging._stdout_lock = contextlib.nullcontext()
    fake = FakeStdout()
    real_stdout = sys.stdout
    sys.stdout = fake
    try:
        threads = [threading.Thread(target=lambda i=i: [fresh.NativeMessaging.send_message({"t": i, "n": n, "pad": "x" * 50}) for n in range(30)])
                   for i in range(20)]
        for t in threads: t.start()
        for t in threads: t.join()
    finally:
        sys.stdout = real_stdout
    frames, clean = parse_frames(fake.buffer.getvalue())
    return len(frames), clean

count, clean = hammer(use_lock=True)
check("C1 with lock: 600 frames from 20 threads decode cleanly", count == 600 and clean)
count, clean = hammer(use_lock=False)
check("C2 baseline without lock corrupts frames", not (count == 600 and clean))

big = {"status": "success", "log": "y" * (2 * 1024 * 1024)}
check("C3 >1MB message is trimmed under Chrome's limit", len(host.NativeMessaging._encode(big)) <= 1024 * 1024)

for name, ok in results:
    print(("PASS  " if ok else "FAIL  ") + name)
print(f"\n{sum(ok for _, ok in results)}/{len(results)} passed")
sys.exit(0 if all(ok for _, ok in results) else 1)
