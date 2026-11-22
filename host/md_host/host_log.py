"""host.log plus live forwarding of log lines to authenticated TCP bridge clients."""
import os
import socket
import sys
import threading
from typing import Any, List

# host/host.log (next to host.py), as before the package split.
LOG_FILE_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "host.log")

_clients: List[socket.socket] = []
_clients_lock = threading.Lock()


def log_info(message: Any) -> None:
    try:
        with open(LOG_FILE_PATH, "a", encoding="utf-8") as log_file:
            log_file.write(f"{message}\n")
    except OSError as error:
        # stderr is never parsed by Chrome as protocol data, so it is the safe last resort.
        print(f"[host] Could not write host.log: {error}", file=sys.stderr)


def add_client(client: socket.socket) -> None:
    with _clients_lock:
        _clients.append(client)


def remove_client(client: socket.socket) -> None:
    with _clients_lock:
        if client in _clients:
            _clients.remove(client)


def broadcast(message: Any) -> None:
    """Writes to host.log and streams the line to every connected desktop-app console."""
    log_info(message)
    with _clients_lock:
        clients = list(_clients)
    payload = f"{message}\n".encode("utf-8", errors="replace")
    for client in clients:
        try:
            client.sendall(payload)
        except OSError as error:
            remove_client(client)
            log_info(f"Dropped TCP log client after send failure: {error}")
