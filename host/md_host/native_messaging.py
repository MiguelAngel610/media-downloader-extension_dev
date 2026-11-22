"""Chrome Native Messaging over stdio: every message is a 32-bit native-order length + UTF-8 JSON.

Limits (developer.chrome.com/docs/extensions/develop/concepts/native-messaging):
host -> Chrome messages may not exceed 1 MB, otherwise Chrome drops the connection.
"""
import json
import struct
import sys
import threading
from typing import Any, Dict, Optional

MAX_MESSAGE_BYTES = 1024 * 1024
LOG_TAIL_CHARS = 4000

# The main loop and the TCP bridge threads both write: each frame (length + body) must be atomic.
_STDOUT_LOCK = threading.Lock()


def read_message() -> Optional[Dict[str, Any]]:
    """Blocks for the next message; returns None when Chrome closed stdin (time to exit)."""
    raw_length = sys.stdin.buffer.read(4)
    if len(raw_length) < 4:
        return None
    (message_length,) = struct.unpack("@I", raw_length)
    return json.loads(sys.stdin.buffer.read(message_length).decode("utf-8"))


def encode_message(message: Dict[str, Any]) -> bytes:
    """JSON-encodes a message, trimming its `log` (or dropping it) to respect Chrome's 1 MB limit."""
    encoded = json.dumps(message).encode("utf-8")
    if len(encoded) <= MAX_MESSAGE_BYTES:
        return encoded
    if isinstance(message.get("log"), str):
        trimmed = dict(message, log=message["log"][-LOG_TAIL_CHARS:], log_truncated=True)
        encoded = json.dumps(trimmed).encode("utf-8")
        if len(encoded) <= MAX_MESSAGE_BYTES:
            return encoded
    return json.dumps({"status": message.get("status", "error"),
                       "message": "Host response exceeded Chrome's 1 MB limit and was dropped"}).encode("utf-8")


def send_message(message: Dict[str, Any]) -> None:
    body = encode_message(message)
    with _STDOUT_LOCK:
        sys.stdout.buffer.write(struct.pack("@I", len(body)))
        sys.stdout.buffer.write(body)
        sys.stdout.buffer.flush()
