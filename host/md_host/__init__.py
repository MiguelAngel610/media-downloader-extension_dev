"""Media Downloader native messaging host.

Package map (each folder groups one domain; each module has one responsibility):
    app.py        main loop: read a request, route it, answer with its request_id
    transport/    native_messaging (Chrome stdio protocol) · tcp_bridge (authenticated desktop-app bridge)
    routing/      media_request (immutable request model) · request_router (validation, duplicates, dispatch)
    handlers/     one module per download strategy: direct_media · gallery_dl_handler · ytdlp_handler
    engines/      thin wrappers around the tools: ytdlp · gallery_dl · direct_http
    security/     path_guard (safe path segments) · url_safety (http(s)-only URLs)
    files/        paths · filenames (templates, collisions) · timestamps · fs_utils (cleanup)
    runtime/      host_log (host.log + console forwarding) · environment (tool PATH setup)

Dependency direction: app -> routing -> handlers -> engines; every layer may use security/files/runtime.
"""
