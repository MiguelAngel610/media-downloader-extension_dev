"""Media Downloader native messaging host.

Module map (one responsibility each):
    app               main loop: read a request, route it, answer with its request_id
    native_messaging  Chrome stdio protocol (32-bit length prefix + UTF-8 JSON)
    host_log          host.log file + live forwarding to the desktop app console
    tcp_bridge        authenticated local bridge used by the desktop app
    request_router    validation, duplicate filter and dispatch to a handler
    handlers/*        one module per download strategy
    engines/*         thin wrappers around yt-dlp, gallery-dl and plain HTTP
    path_guard        turns untrusted metadata into safe path segments
    filenames         filename templates and collision handling
"""
