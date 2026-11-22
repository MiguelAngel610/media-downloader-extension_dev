"""Media Downloader native messaging host.

Flat package: one module per responsibility; only the two layers with several interchangeable
strategies have their own folder.
    app.py                main loop: read a request, route it, answer with its request_id
    native_messaging.py   Chrome stdio protocol (32-bit length prefix + JSON, serialized writes)
    tcp_bridge.py         authenticated bridge for the desktop app
    media_request.py      immutable request model
    request_router.py     validation, duplicate suppression, dispatch to a handler
    handlers/             one module per download strategy: direct_media · gallery_dl_handler · ytdlp_handler
    engines/              thin wrappers around the tools: ytdlp · gallery_dl · direct_http
    security.py           safe path segments and http(s)-only URLs for untrusted page input
    paths.py              the gallery-dl folder and temporary-file cleanup
    filenames.py          filename templates and collisions
    timestamps.py         upload-date normalization
    host_log.py           host.log + console forwarding
    environment.py        tool PATH setup (gallery-dl, ffmpeg)

Dependency direction: app -> request_router -> handlers -> engines; any module may use the shared
helpers (security, paths, filenames, timestamps, host_log).
"""
