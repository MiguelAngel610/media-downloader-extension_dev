"""Authenticated local TCP bridge used by the Media Downloader desktop app (log console + backup commands).

Protocol: newline-delimited JSON. The first line must be {"action": "auth", "token": "<token>"};
the token is generated once into ~/gallery-dl/md_bridge_token.txt (outside every repository).
Only authenticated clients receive log lines, and only ALLOWED_ACTIONS are forwarded to Chrome.
"""
import hmac
import json
import os
import secrets
import socket
import threading
from typing import Any, Dict, Iterator, Optional

from md_host import host_log, native_messaging, paths

TOKEN_FILENAME = "md_bridge_token.txt"
DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 65432
ALLOWED_ACTIONS = frozenset({"start_backup", "stop_backup"})
AUTH_TIMEOUT_SECONDS = 5.0
MAX_LINE_BYTES = 64 * 1024


def token_path() -> str:
    return os.path.join(paths.gallery_dir(), TOKEN_FILENAME)


def load_or_create_token() -> str:
    path = token_path()
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as token_file:
            token = token_file.read().strip()
        if token:
            return token
    token = secrets.token_urlsafe(32)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as token_file:
        token_file.write(token)
    host_log.log_info(f"Generated new TCP bridge token at {path}")
    return token


def is_valid_token(candidate: Any, expected: str) -> bool:
    # compare_digest takes constant time, so the token can't be guessed byte by byte.
    return isinstance(candidate, str) and hmac.compare_digest(candidate.encode("utf-8"), expected.encode("utf-8"))


def create_listening_socket(host: str, port: int) -> socket.socket:
    server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    if hasattr(socket, "SO_EXCLUSIVEADDRUSE"):
        # Windows: SO_REUSEADDR would let another process bind the same port and
        # intercept clients (and their token); exclusive use forbids that.
        server.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
    else:
        server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    server.bind((host, port))
    server.listen(5)
    return server


def iter_lines(client: socket.socket) -> Iterator[str]:
    """Yields one decoded line at a time; a trailing message without '\\n' is flushed on close."""
    buffer = b""
    while True:
        data = client.recv(4096)
        if not data:
            break
        buffer += data
        if len(buffer) > MAX_LINE_BYTES and b"\n" not in buffer:
            raise ValueError(f"TCP message exceeded {MAX_LINE_BYTES} bytes")
        while b"\n" in buffer:
            line, buffer = buffer.split(b"\n", 1)
            if line.strip():
                yield line.decode("utf-8", errors="replace")
    if buffer.strip():
        yield buffer.decode("utf-8", errors="replace")


def parse_message(line: str) -> Optional[Dict[str, Any]]:
    """A JSON object, or None (logged) for anything else: the connection is then closed."""
    try:
        message = json.loads(line)
    except json.JSONDecodeError as error:
        host_log.log_info(f"TCP bridge: invalid JSON rejected: {error}")
        return None
    if not isinstance(message, dict):
        host_log.log_info("TCP bridge: non-object message rejected")
        return None
    return message


class TcpBridgeServer:
    def __init__(self, host: str = DEFAULT_HOST, port: int = DEFAULT_PORT):
        self.host = host
        self.port = port
        self.token = ""

    def start(self) -> None:
        try:
            self.token = load_or_create_token()
        except OSError as error:
            host_log.log_info(f"TCP bridge disabled: cannot load or create token: {error}")
            return
        threading.Thread(target=self._serve_forever, daemon=True).start()

    def _serve_forever(self) -> None:
        try:
            server = create_listening_socket(self.host, self.port)
        except OSError as error:
            host_log.log_info(f"Failed to start TCP bridge: {error}")
            return
        host_log.log_info(f"TCP bridge started on port {self.port}")
        while True:
            try:
                client, _address = server.accept()
            except OSError as error:
                host_log.log_info(f"TCP accept error: {error}")
                continue
            threading.Thread(target=self._handle_client, args=(client,), daemon=True).start()

    def _authenticate(self, client: socket.socket, message: Dict[str, Any]) -> bool:
        if message.get("action") != "auth" or not is_valid_token(message.get("token"), self.token):
            host_log.log_info("TCP bridge: connection rejected (missing or invalid token)")
            return False
        client.settimeout(None)  # Log listeners stay connected indefinitely once trusted.
        host_log.add_client(client)
        return True

    @staticmethod
    def _forward(message: Dict[str, Any]) -> None:
        action = message.get("action")
        if action not in ALLOWED_ACTIONS:
            host_log.log_info(f"TCP bridge: action not allowed: {action!r}")
            return
        native_messaging.send_message(message)

    def _handle_client(self, client: socket.socket) -> None:
        authenticated = False
        client.settimeout(AUTH_TIMEOUT_SECONDS)
        try:
            for line in iter_lines(client):
                message = parse_message(line)
                if message is None:
                    break
                if authenticated:
                    self._forward(message)
                    continue
                authenticated = self._authenticate(client, message)
                if not authenticated:
                    break
        except (OSError, ValueError) as error:
            host_log.log_info(f"TCP client error: {error}")
        finally:
            host_log.remove_client(client)
            client.close()
