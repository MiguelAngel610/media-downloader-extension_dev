"""Main loop of the native host: one request in, one result out (tagged with its request_id)."""
from typing import Any, Dict

from md_host import request_router
from md_host import environment, host_log
from md_host import native_messaging
from md_host.tcp_bridge import TcpBridgeServer


def with_request_id(result: Dict[str, Any], request_id: Any) -> Dict[str, Any]:
    """The extension routes each result to the tab that asked for it by this id."""
    if isinstance(request_id, str) and request_id:
        return dict(result, request_id=request_id)
    return result


def handle_message(message: Dict[str, Any]) -> None:
    if "url" in message:
        result = request_router.process_request(message)
        native_messaging.send_message(with_request_id(result, message.get("request_id")))
    elif message.get("action") == "backup_log" and "status" in message:
        host_log.broadcast(message.get("message", ""))
    else:
        host_log.log_info(f"Ignored native message without url/action: {list(message.keys())}")


def main() -> None:
    environment.inject_tool_paths()
    TcpBridgeServer().start()
    # Lets the extension flush requests it queued while this process was starting.
    native_messaging.send_message({"action": "host_ready"})

    while True:
        try:
            message = native_messaging.read_message()
        except (ValueError, UnicodeDecodeError) as error:  # malformed frame: report it and keep serving
            host_log.log_info(f"Rejected malformed native message: {error!r}")
            native_messaging.send_message({"status": "error", "message": f"Malformed message: {error}"})
            continue
        if message is None:
            return  # Chrome closed the port
        try:
            handle_message(message)
        except Exception as error:  # Error boundary: one bad request must never kill the host loop.
            host_log.log_info(f"Unhandled error while processing request: {error!r}")
            native_messaging.send_message(with_request_id({"status": "error", "message": str(error)}, message.get("request_id")))
