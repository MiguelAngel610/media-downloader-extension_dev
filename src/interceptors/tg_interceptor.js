// Media Downloader - Telegram main-world bridge.
//
// Telegram's Service Worker rejects fetch() calls made from the content
// script's isolated world to its /progressive/document... streaming
// endpoint (confirmed: identical headers/credentials to the browser's own
// request still gets a synthetic broken 302 + the app's index.html body).
// Running the SAME fetch() from inside the page's own JS context (the "main
// world", where Telegram's own code runs) makes it a same-origin, same-
// client request that the Service Worker should treat as legitimate.
(function () {
    const contentRangeRegex = /^bytes (\d+)-(\d+)\/(\d+)$/;

    window.addEventListener("message", async (event) => {
        if (event.source !== window || !event.data) return;
        if (event.data.type !== "MD_TEL_FETCH_VIDEO") return;

        const { requestId, url } = event.data;

        const respond = (payload) => {
            window.postMessage({ type: "MD_TEL_FETCH_VIDEO_RESULT", requestId, ...payload }, "*");
        };

        try {
            let offset = 0;
            let totalSize = null;
            const parts = [];
            let hops = 0;
            const MAX_HOPS = 5;
            let fetchUrl = url;

            while (true) {
                const res = await fetch(fetchUrl, {
                    method: "GET",
                    credentials: "omit",
                    headers: { Range: `bytes=${offset}-` },
                });

                if ([301, 302, 303, 307, 308].includes(res.status)) {
                    const location = res.headers.get("Location");
                    hops++;
                    if (location && hops <= MAX_HOPS) {
                        fetchUrl = location;
                        continue;
                    }
                    const bodyText = await res.text().catch(() => "");
                    respond({ ok: false, error: "Broken redirect (status " + res.status + ")", bodyPreview: bodyText.slice(0, 300) });
                    return;
                }

                if (![200, 206].includes(res.status)) {
                    respond({ ok: false, error: "Non 200/206 response: " + res.status });
                    return;
                }

                const contentType = res.headers.get("Content-Type") || "";
                if (contentType.startsWith("text/html")) {
                    const bodyText = await res.text().catch(() => "");
                    respond({ ok: false, error: "Got HTML instead of media (likely SW rejection)", bodyPreview: bodyText.slice(0, 300) });
                    return;
                }

                const contentRange = res.headers.get("Content-Range");
                const blob = await res.blob();

                if (!contentRange) {
                    if (res.status === 200 && offset === 0) {
                        // Full file in one shot.
                        respond({ ok: true, blob, mimeType: contentType });
                        return;
                    }
                    respond({ ok: false, error: "Missing Content-Range at offset " + offset });
                    return;
                }

                const match = contentRange.match(contentRangeRegex);
                if (!match) {
                    respond({ ok: false, error: "Malformed Content-Range: " + contentRange });
                    return;
                }
                const start = parseInt(match[1]);
                const end = parseInt(match[2]);
                const total = parseInt(match[3]);

                if (start !== offset) {
                    respond({ ok: false, error: "Gap detected: expected " + offset + " got " + start });
                    return;
                }
                if (totalSize !== null && total !== totalSize) {
                    respond({ ok: false, error: "Total size changed mid-stream" });
                    return;
                }

                totalSize = total;
                parts.push(blob);
                offset = end + 1;

                window.postMessage({
                    type: "MD_TEL_FETCH_VIDEO_PROGRESS",
                    requestId,
                    progress: Math.min(100, Math.round((offset / totalSize) * 100)),
                }, "*");

                if (offset >= totalSize) {
                    const finalBlob = new Blob(parts, { type: contentType.split(";")[0] || "video/mp4" });
                    respond({ ok: true, blob: finalBlob, mimeType: contentType });
                    return;
                }
            }
        } catch (e) {
            respond({ ok: false, error: String(e) });
        }
    });
})();
