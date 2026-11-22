"""Timestamp normalization: Instagram mixes seconds, milliseconds and microseconds."""
import datetime
import time
from typing import Any, Dict

from md_host.runtime import host_log

_MICROSECONDS_THRESHOLD = 1e14
_MILLISECONDS_THRESHOLD = 1e11


def resolve_timestamp(metadata: Dict[str, Any]) -> int:
    """
    Unix seconds from metadata["timestamp"]. Falls back to 'now' only when absent or invalid,
    and logs it so a wrong date in a filename is never silent.
    """
    raw = metadata.get("timestamp")
    try:
        value = float(raw)
    except (TypeError, ValueError):
        host_log.broadcast(f"WARNING: no valid original timestamp ({raw!r}); filename uses the download date")
        return int(time.time())
    if value > _MICROSECONDS_THRESHOLD:
        value /= 1_000_000
    elif value > _MILLISECONDS_THRESHOLD:
        value /= 1000
    return int(value)


def to_local_datetime(timestamp: int) -> datetime.datetime:
    """Local datetime, or 'now' (logged) when the platform cannot represent the timestamp."""
    try:
        return datetime.datetime.fromtimestamp(timestamp)
    except (OverflowError, OSError, ValueError) as error:
        host_log.broadcast(f"WARNING: timestamp {timestamp} out of range ({error}); using the download date")
        return datetime.datetime.now()
