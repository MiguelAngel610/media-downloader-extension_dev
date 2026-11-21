"""Native Messaging protocol test: runs host.py as Chrome does (stdin/stdout, 32-bit length prefix)."""
import json
import os
import struct
import subprocess
import sys
import tempfile

host_path = sys.argv[1]
# Isolated home: the host creates its bridge token under ~/gallery-dl.
env = dict(os.environ, USERPROFILE=tempfile.mkdtemp(prefix="md_proto_"), HOME="")
proc = subprocess.Popen([sys.executable, host_path], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                        stderr=subprocess.PIPE, env=env)


def send(message: dict) -> None:
    data = json.dumps(message).encode("utf-8")
    proc.stdin.write(struct.pack("@I", len(data)) + data)
    proc.stdin.flush()


def receive() -> dict:
    (length,) = struct.unpack("@I", proc.stdout.read(4))
    return json.loads(proc.stdout.read(length))


first = receive()
send({"url": "https://example.invalid/x.jpg", "platform": r"..\evil", "request_id": "req-123", "direct_metadata": {}})
second = receive()
proc.stdin.close()
proc.wait(timeout=10)

checks = [
    ("host announces host_ready first", first == {"action": "host_ready"}),
    ("result echoes request_id", second.get("request_id") == "req-123"),
    ("unknown platform rejected", second.get("message") == "Unknown platform"),
    ("host exits cleanly on stdin EOF", proc.returncode == 0),
]
for name, ok in checks:
    print(("PASS  " if ok else "FAIL  ") + name)
print(f"\n{sum(ok for _, ok in checks)}/{len(checks)} passed")
sys.exit(0 if all(ok for _, ok in checks) else 1)
