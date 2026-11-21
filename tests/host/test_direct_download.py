"""Phase 5 host tests: atomic direct download against a real local HTTP server, timestamp resolution."""
import http.server
import importlib.util
import os
import sys
import tempfile
import threading
import time

spec = importlib.util.spec_from_file_location("host", sys.argv[1])
host = importlib.util.module_from_spec(spec)
spec.loader.exec_module(host)
host.Logger.log_info = staticmethod(lambda msg: None)
logs = []
host.Logger.broadcast_log = classmethod(lambda cls, msg: logs.append(str(msg)))

PAYLOAD = os.urandom(300_000)

class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass  # keep test output clean

    def do_GET(self):
        if self.path == "/full.jpg":
            self.send_response(200)
            self.send_header("Content-Length", str(len(PAYLOAD)))
            self.end_headers()
            self.wfile.write(PAYLOAD)
        elif self.path == "/truncated.jpg":
            self.send_response(200)
            self.send_header("Content-Length", str(len(PAYLOAD)))
            self.end_headers()
            self.wfile.write(PAYLOAD[:100_000])  # connection drops mid-file
            self.wfile.flush()
            self.close_connection = True
        elif self.path == "/empty.jpg":
            self.send_response(200)
            self.send_header("Content-Length", "0")
            self.end_headers()

server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
threading.Thread(target=server.serve_forever, daemon=True).start()
base = f"http://127.0.0.1:{server.server_port}"
out_dir = tempfile.mkdtemp(prefix="md_direct_")
E = host.DownloaderEngines
results = []

def check(name, ok):
    results.append((name, bool(ok)))

target = os.path.join(out_dir, "full.jpg")
res = E.execute_direct_http(f"{base}/full.jpg", target)
check("P1 complete download saved byte-exact", res["status"] == "success" and open(target, "rb").read() == PAYLOAD)
check("P2 no .part left after success", not os.path.exists(target + ".part"))

target = os.path.join(out_dir, "truncated.jpg")
res = E.execute_direct_http(f"{base}/truncated.jpg", target)
check("P3 truncated transfer reported as error", res["status"] == "error")
check("P4 truncated transfer leaves NO final file (no fake 'already downloaded')", not os.path.exists(target))
check("P5 truncated transfer leaves no .part", not os.path.exists(target + ".part"))

target = os.path.join(out_dir, "empty.jpg")
res = E.execute_direct_http(f"{base}/empty.jpg", target)
check("P6 empty body rejected", res["status"] == "error" and not os.path.exists(target))
check("P7 non-http URL rejected", E.execute_direct_http("file:///C:/Windows/win.ini", os.path.join(out_dir, "x"))["status"] == "error")

now = int(time.time())
check("T1 seconds kept", host.resolve_timestamp({"timestamp": 1700000000}) == 1700000000)
check("T2 milliseconds converted", host.resolve_timestamp({"timestamp": 1700000000123}) == 1700000000)
check("T3 microseconds (device_timestamp) converted", host.resolve_timestamp({"timestamp": 1700000000123456}) == 1700000000)
logs.clear()
fallback = host.resolve_timestamp({"timestamp": None})
check("T4 null timestamp -> now, no crash", abs(fallback - now) < 5)
check("T5 fallback is logged (not silent)", any("no valid original timestamp" in l for l in logs))
check("T6 numeric string accepted", host.resolve_timestamp({"timestamp": "1700000000"}) == 1700000000)

server.shutdown()
for name, ok in results:
    print(("PASS  " if ok else "FAIL  ") + name)
print(f"\n{sum(ok for _, ok in results)}/{len(results)} passed")
sys.exit(0 if all(ok for _, ok in results) else 1)
