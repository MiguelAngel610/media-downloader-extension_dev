// src/telegram/core/downloader.js
(function() {
    window.__md_tel_logger = {
        info: (message, fileName = null) => {
            console.log(`[Media Downloader - Telegram] ${fileName ? `${fileName}: ` : ""}${message}`);
        },
        error: (message, fileName = null) => {
            console.error(`[Media Downloader - Telegram] ${fileName ? `${fileName}: ` : ""}${message}`);
        },
    };

    const logger = window.__md_tel_logger;
    const contentRangeRegex = /^bytes (\d+)-(\d+)\/(\d+)$/;

    // --- Capture-based video download ---
    // Telegram's Service Worker rejects our direct fetch() calls to its
    // `/progressive/document...` streaming endpoint with a synthetic broken
    // response (302 with no Location, serving the app's index.html instead of
    // the video), even when headers/credentials exactly match what the
    // browser's own <video> tag sends — likely because the SW keys its
    // internal stream-session state to the requesting client/document in a
    // way an external fetch() can't replicate. Since the *browser itself* can
    // clearly play the video fine, we capture it directly from the live
    // <video> element via captureStream() + MediaRecorder instead of
    // re-requesting it over the network ourselves.
    //
    // Caveat (communicated to the user): this re-encodes the video through
    // the browser's recording pipeline. Visual quality/resolution is
    // preserved at a high bitrate. Output is native .mp4 (H.264) when the
    // browser's MediaRecorder supports recording directly to mp4 (Chrome
    // 105+); otherwise it falls back to .webm. Either way it's a re-encode,
    // not a byte-perfect copy of Telegram's original source file.
    // --- Smart video download: try a real network download first (fast),
    // fall back to live capture (slow but always works) if that's blocked. ---
    //
    // The main-world fetch (window.__md_tel_fetch_video_mainworld, provided by
    // tel_vanish_init.js) runs the request from INSIDE Telegram's own page
    // context instead of the extension's isolated content-script world. This
    // gives a real shot at getting past the Service Worker's rejection of
    // "external" fetches, while still downloading at network speed (no
    // waiting through video duration). If it's not available or fails for
    // any reason, we transparently fall back to the capture-based method.
    window.__md_tel_download_video_smart = async (videoElement, fileNameHint, stableIdHint) => {
        const sources = Array.from(videoElement.querySelectorAll("source"));
        let bestUrl = null;
        if (sources.length > 0) {
            const withWidth = sources.map(s => ({ s, w: parseInt(s.getAttribute("width") || "0") }));
            withWidth.sort((a, b) => b.w - a.w);
            bestUrl = withWidth[0].s.src;
        } else {
            bestUrl = videoElement.src || videoElement.currentSrc;
        }

        if (bestUrl && window.__md_tel_fetch_video_mainworld) {
            const videoId = (Math.random() + 1).toString(36).substring(2, 10) + "_" + Date.now().toString();
            let hashStr = stableIdHint;
            if (!hashStr && videoElement && videoElement.duration) {
                hashStr = window.__md_tel_hashCode(videoElement.duration + "_" + videoElement.videoWidth + "_" + videoElement.videoHeight).toString(36);
            }
            const hash = hashStr || window.__md_tel_hashCode(bestUrl).toString(36);
            let fileName = window.FilenameFormatter.format(fileNameHint, hash, 'mp4');

            if (window.__md_tel_createProgressBar) window.__md_tel_createProgressBar(videoId, fileName);

            try {
                logger.info("Trying main-world network download first...", fileName);
                const { blob, mimeType } = await window.__md_tel_fetch_video_mainworld(bestUrl, (pct) => {
                    if (window.__md_tel_updateProgress) window.__md_tel_updateProgress(videoId, fileName, String(pct));
                });

                if (mimeType) {
                    const ext = mimeType.split(";")[0].split("/")[1];
                    if (ext && ext !== "octet-stream") fileName = fileName.replace(/\.[a-z0-9]+$/i, "") + "." + ext;
                }

                // Telegram serves this endpoint as fragmented MP4 (fMP4/DASH
                // style) — playable, but most players can't seek/scrub it
                // because the duration and keyframe index aren't present in
                // a single consolidated form. Remux it into a flat MP4 with
                // a complete moov (same approach as `ffmpeg -movflags
                // faststart`, zero quality loss — only the container is
                // reorganized, audio/video bytes are untouched) so the
                // downloaded file behaves like a normal video file.
                let finalBlob = blob;
                logger.info("Remux availability check: __md_tel_remux_fmp4=" + (typeof window.__md_tel_remux_fmp4) + " fileName=" + fileName + " mimeType=" + mimeType, fileName);
                if (window.__md_tel_remux_fmp4 && (fileName.toLowerCase().endsWith(".mp4") || (mimeType && mimeType.includes("mp4")))) {
                    try {
                        const arrayBuffer = await blob.arrayBuffer();
                        const remuxedBytes = window.__md_tel_remux_fmp4(arrayBuffer);
                        finalBlob = new Blob([remuxedBytes], { type: blob.type || "video/mp4" });
                        logger.info("Remuxed to flat MP4 for seek support", fileName);
                    } catch (remuxErr) {
                        // Not fatal — the input may already be a flat MP4
                        // (not fragmented), in which case remux wasn't
                        // needed and the file is fully seekable as-is.
                        finalBlob = blob;
                    }
                }

                const blobUrl = window.URL.createObjectURL(finalBlob);
                const a = document.createElement("a");
                document.body.appendChild(a);
                a.href = blobUrl;
                a.download = fileName;
                a.click();
                document.body.removeChild(a);
                window.URL.revokeObjectURL(blobUrl);

                if (window.__md_tel_completeProgress) window.__md_tel_completeProgress(videoId);
                logger.info("Main-world network download succeeded: " + fileName, fileName);
                return;
            } catch (e) {
                logger.error("Main-world network download failed (" + e + "), falling back to live capture...", fileName);
                if (window.__md_tel_AbortProgress) window.__md_tel_AbortProgress(videoId);
                // fall through to capture below
            }
        }

        // Fallback: capture-based download (slower — plays in real time — but
        // does not depend on the network endpoint at all).
        window.__md_tel_capture_video_element(videoElement, fileNameHint, stableIdHint);
    };




    window.__md_tel_download_video = (url, fileNameHint, stableIdHint) => {
        // Keep the ORIGINAL url untouched. `url` gets reassigned on redirects,
        // and using the mutated value for a fallback full-download was producing
        // truncated/corrupted .mp4 files (fallback hit a mid-stream/partial URL).
        const originalUrl = url;

        let _blobs = [];
        let _next_offset = 0;
        let _total_size = null;
        let _file_extension = "mp4";
        let _bytesWritten = false; // true once we've actually written/buffered any chunk

        const videoId = (Math.random() + 1).toString(36).substring(2, 10) + "_" + Date.now().toString();
        const hash = stableIdHint || window.__md_tel_hashCode(url).toString(36);
        let fileName = window.FilenameFormatter.format(fileNameHint, hash, 'mp4');

        try {
            const metadata = JSON.parse(decodeURIComponent(url.split("/")[url.split("/").length - 1]));
            if (metadata.fileName) {
                fileName = metadata.fileName;
            }
        } catch (err) { window.MDErrorReporter.reportError('TG Download: metadata filename', err); }

        logger.info(`URL: ${url}`, fileName);

        // Cleans up a partially-written file so we never leave a truncated artifact on disk.
        const abortWritable = (_writable) => {
            if (_writable && typeof _writable.abort === "function") {
                _writable.abort().catch((err) => window.MDErrorReporter.reportError('TG Download: abort partial file', err));
            }
        };

        const failHard = (_writable, reason) => {
            logger.error("Video download failed permanently: " + reason, fileName);
            abortWritable(_writable);
            if (window.__md_tel_AbortProgress) window.__md_tel_AbortProgress(videoId);
        };

        // Telegram's aggressive Service Worker can issue a redirect to a fresh CDN node
        // mid-download. We must NOT let that redirect spawn a second, concurrent
        // fetchNextPart() call sharing the same _next_offset/_writable — that race was
        // producing the stray ".crswap" leftover file and a progress bar that never
        // finished. Instead we resolve the redirect synchronously inside the SAME
        // promise chain via recursion (return fetchNextPart(...)), with a hop limit.
        let _redirectHops = 0;
        const MAX_REDIRECT_HOPS = 5;

        let _triedWithoutRange = false;

        const fetchNextPart = (_writable) => {
            const fetchHeaders = {};
            if (!(_next_offset === 0 && _triedWithoutRange)) {
                fetchHeaders.Range = `bytes=${_next_offset}-`;
            }

            // IMPORTANT: Telegram's progressive streaming endpoint (/a/progressive/document...)
            // expects to be called WITHOUT session cookies — confirmed by capturing the
            // browser's own real request via DevTools "Copy as fetch", which uses
            // `credentials: "omit"`. The URL itself is presumably signed/scoped, so it
            // doesn't need cookie auth. Sending `credentials: "include"` here was the
            // actual root cause of the corrupted downloads: Telegram's Service Worker
            // was rejecting the cookie-bearing request with a synthetic broken 302
            // (no Location header) and falling back to serving the app's index.html,
            // which we were then saving to disk as if it were the video.
            return fetch(url, {
                method: "GET",
                credentials: "omit",
                headers: fetchHeaders,
            })
            .then((res) => {
                logger.info("Chunk response: status=" + res.status +
                    " range=" + res.headers.get("Content-Range") +
                    " length=" + res.headers.get("Content-Length") +
                    " type=" + res.headers.get("Content-Type") +
                    " requestedOffset=" + _next_offset +
                    " sentRangeHeader=" + (!!fetchHeaders.Range), fileName);

                if ([301, 302, 303, 307, 308].includes(res.status)) {
                    const location = res.headers.get("Location");
                    _redirectHops++;
                    if (location && _redirectHops <= MAX_REDIRECT_HOPS) {
                        url = location;
                        // Chain the retry onto THIS promise instead of firing a parallel
                        // call — only one fetchNextPart for this offset is ever in flight.
                        return fetchNextPart(_writable);
                    }

                    // No Location header: this is very likely Telegram's Service Worker
                    // intercepting the fetch and synthesizing an error response (per
                    // project notes) rather than a real HTTP redirect. Log the actual
                    // body so we can see the real reason instead of guessing.
                    return res.text().then((bodyText) => {
                        logger.error("Broken redirect body (first 500 chars): " + bodyText.slice(0, 500), fileName);

                        // One-shot retry at offset 0 WITHOUT a Range header, in case this
                        // progressive endpoint only serves the stream when asked for the
                        // full resource first (some Telegram CDN paths reject a Range on
                        // a "cold" request).
                        if (_next_offset === 0 && !_triedWithoutRange) {
                            _triedWithoutRange = true;
                            logger.info("Retrying first chunk without Range header...", fileName);
                            return fetchNextPart(_writable);
                        }

                        throw new Error("Redirect with no Location header or too many hops (" + res.status + ")");
                    });
                }
                _redirectHops = 0;

                if (![200, 206].includes(res.status)) {
                    throw new Error("Non 200/206 response was received: " + res.status);
                }
                const mime = res.headers.get("Content-Type")?.split(";")[0] || "video/mp4";
                if (!mime.startsWith("video/") && !mime.startsWith("application/")) {
                    throw new Error("Get non video response with MIME type " + mime);
                }
                _file_extension = mime.split("/")[1] || "mp4";
                if (_file_extension === "octet-stream") _file_extension = "mp4";
                fileName = fileName.substring(0, fileName.indexOf(".") + 1) + _file_extension;

                const contentRange = res.headers.get("Content-Range");
                if (!contentRange) {
                    // A 200 with no Content-Range only means "full file" if we asked
                    // for the full file (offset 0). If we're mid-download (offset > 0)
                    // and suddenly get a bare 200, the server/SW ignored our Range
                    // header and is handing us the file from the start again — NOT
                    // the remaining bytes. Accepting that as "done" silently corrupts
                    // the output (this was likely the real source of the corrupt mp4).
                    if (res.status === 200 && _next_offset === 0) {
                        const totalSize = parseInt(res.headers.get("Content-Length") || "0");
                        _total_size = totalSize || 1;
                        _next_offset = _total_size; 
                        
                        if (window.__md_tel_updateProgress) {
                            window.__md_tel_updateProgress(videoId, fileName, "100");
                        }
                        return res.blob();
                    }
                    throw new Error("Missing Content-Range header at offset " + _next_offset + " (status " + res.status + " — server likely ignored Range header)");
                }

                const match = contentRange.match(contentRangeRegex);
                if (!match) {
                    throw new Error("Malformed Content-Range header: " + contentRange);
                }
                const startOffset = parseInt(match[1]);
                const endOffset = parseInt(match[2]);
                const totalSize = parseInt(match[3]);

                if (startOffset !== _next_offset) {
                    throw new Error("Gap detected between responses. Expected start=" + _next_offset + " got=" + startOffset);
                }
                if (_total_size && totalSize !== _total_size) {
                    throw new Error("Total size differs. Was=" + _total_size + " now=" + totalSize);
                }

                _next_offset = endOffset + 1;
                _total_size = totalSize;

                if (window.__md_tel_updateProgress) {
                    window.__md_tel_updateProgress(videoId, fileName, ((_next_offset * 100) / _total_size).toFixed(0));
                }
                return res.blob();
            })
            .then((resBlob) => {
                if (!resBlob) return; // Defensive: nothing to write
                logger.info("Chunk blob size=" + resBlob.size + " type=" + resBlob.type, fileName);

                const isFirstChunk = !_bytesWritten;

                if (isFirstChunk && resBlob.size >= 12) {
                    // Sanity-check the very first chunk's magic bytes. Telegram's
                    // Service Worker has been observed (per project notes) serving
                    // synthetic/cached responses that pass our status/header checks
                    // but aren't actually the video — this is the likeliest source
                    // of a download that "completes" yet plays back corrupted.
                    return resBlob.slice(0, 12).arrayBuffer().then((buf) => {
                        const bytes = new Uint8Array(buf);
                        const ascii = Array.from(bytes.slice(4, 8)).map(b => String.fromCharCode(b)).join("");
                        // Valid MP4/MOV files have an "ftyp" box starting at byte 4.
                        // Also reject obvious HTML/JSON error pages mistakenly typed as video.
                        const looksLikeHtmlOrJson = bytes[0] === 0x3c /* '<' */ || bytes[0] === 0x7b /* '{' */;
                        const looksLikeMp4 = ascii === "ftyp";

                        if (looksLikeHtmlOrJson || (!looksLikeMp4 && _file_extension === "mp4")) {
                            throw new Error("First chunk does not look like a valid video file (got non-media payload, likely a Service Worker / CDN error page disguised as a 200/206 response)");
                        }

                        _bytesWritten = true;
                        if (_writable !== null) {
                            return _writable.write(resBlob);
                        } else {
                            _blobs.push(resBlob);
                        }
                    });
                }

                _bytesWritten = true;
                if (_writable !== null) {
                    return _writable.write(resBlob);
                } else {
                    _blobs.push(resBlob);
                }
            })
            .then(() => {
                if (!_total_size) {
                    throw new Error("_total_size is NULL");
                }

                if (_next_offset < _total_size) {
                    return fetchNextPart(_writable);
                } else {
                    if (_writable !== null) {
                        return _writable.close().then(() => {
                            if (window.__md_tel_completeProgress) window.__md_tel_completeProgress(videoId);
                        });
                    } else {
                        save();
                        if (window.__md_tel_completeProgress) window.__md_tel_completeProgress(videoId);
                    }
                }
            })
            .catch((reason) => {
                logger.error("Fetch failed: " + reason, fileName);

                if (_bytesWritten) {
                    // We are mid-download. Falling back to a fresh background download of
                    // `url` here is exactly what was producing corrupted/truncated .mp4 files,
                    // since `url` may now point at a partial/streaming resource, and/or we'd
                    // end up with a half-written file on disk from the File System Access path.
                    // Abort cleanly instead of silently shipping a broken file.
                    failHard(_writable, reason);
                    return;
                }

                // Nothing was ever written — safe to try a plain full-file download,
                // using the ORIGINAL untouched URL (not a redirect/partial one).
                logger.info("Falling back to background download for video...", fileName);

                if (!chrome || !chrome.runtime || !chrome.runtime.sendMessage) {
                    // Extension context was invalidated (happens on Telegram's web app
                    // after a service-worker-heavy navigation). Nothing more we can do.
                    failHard(_writable, "Extension context invalidated (chrome.runtime unavailable)");
                    return;
                }

                chrome.runtime.sendMessage({
                    action: "browser_download",
                    url: originalUrl,
                    filename: fileName
                }, (response) => {
                    if (chrome.runtime.lastError) {
                        failHard(_writable, chrome.runtime.lastError.message);
                        return;
                    }
                    if (response && response.success) {
                        logger.info("Background video download triggered", fileName);
                        if (window.__md_tel_completeProgress) window.__md_tel_completeProgress(videoId);
                    } else {
                        failHard(_writable, response ? response.error : "Unknown error");
                    }
                });
            });
        };

        const save = () => {
            const blob = new Blob(_blobs, { type: "video/mp4" });
            const blobUrl = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            document.body.appendChild(a);
            a.href = blobUrl;
            a.download = fileName;
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(blobUrl);
        };

        const supportsFileSystemAccess = "showSaveFilePicker" in window && (() => { try { return window.self === window.top; } catch { return false; } })();
        
        if (supportsFileSystemAccess) {
            window.showSaveFilePicker({ suggestedName: fileName }).then((handle) => {
                handle.createWritable().then((writable) => {
                    if (window.__md_tel_createProgressBar) window.__md_tel_createProgressBar(videoId, fileName);
                    fetchNextPart(writable);
                }).catch((err) => console.error(err.name, err.message));
            }).catch((err) => {
                if (err.name !== "AbortError") console.error(err.name, err.message);
            });
        } else {
            if (window.__md_tel_createProgressBar) window.__md_tel_createProgressBar(videoId, fileName);
            fetchNextPart(null);
        }
    };

    window.__md_tel_download_audio = (url, fileNameHint, stableIdHint) => {
        let _blobs = [];
        let _next_offset = 0;
        let _total_size = null;
        const hash = stableIdHint || window.__md_tel_hashCode(url).toString(36);
        const fileName = fileNameHint ? `${fileNameHint}_${hash}.ogg` : `${hash}.ogg`;

        const fetchNextPart = (_writable) => {
            fetch(url, {
                method: "GET",
                headers: { Range: `bytes=${_next_offset}-` },
            }).then((res) => {
                if (res.status !== 206 && res.status !== 200) return;
                const mime = res.headers.get("Content-Type").split(";")[0];
                if (!mime.startsWith("audio/")) throw "Get non audio response";

                const match = res.headers.get("Content-Range").match(contentRangeRegex);
                const startOffset = parseInt(match[1]);
                const endOffset = parseInt(match[2]);
                const totalSize = parseInt(match[3]);

                if (startOffset !== _next_offset) throw "Gap detected";
                _next_offset = endOffset + 1;
                _total_size = totalSize;
                return res.blob();
            })
            .then((resBlob) => {
                if (_writable !== null) return _writable.write(resBlob);
                else _blobs.push(resBlob);
            })
            .then(() => {
                if (_next_offset < _total_size) fetchNextPart(_writable);
                else {
                    if (_writable !== null) _writable.close().then(() => {});
                    else save();
                }
            })
            .catch((reason) => logger.error(reason, fileName));
        };

        const save = () => {
            const blob = new Blob(_blobs, { type: "audio/ogg" });
            const blobUrl = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            document.body.appendChild(a);
            a.href = blobUrl;
            a.download = fileName;
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(blobUrl);
        };

        const supportsFileSystemAccess = "showSaveFilePicker" in window && (() => { try { return window.self === window.top; } catch { return false; } })();
        if (supportsFileSystemAccess) {
            window.showSaveFilePicker({ suggestedName: fileName }).then((handle) => {
                handle.createWritable().then((writable) => fetchNextPart(writable)).catch(err => console.error(err));
            }).catch((err) => { if (err.name !== "AbortError") console.error(err); });
        } else {
            fetchNextPart(null);
        }
    };

    window.__md_tel_download_image = (imageUrlOrEl, fileNameHint, stableIdHint) => {
        let imageUrl = typeof imageUrlOrEl === "string" ? imageUrlOrEl : (imageUrlOrEl?.src || imageUrlOrEl?.currentSrc || "");
        if (!imageUrl) {
            if (window.__md_tel_logger) window.__md_tel_logger.error("No image URL resolved for download.");
            if (window.__md_tel_showToast) window.__md_tel_showToast("No image URL found to download", true);
            return;
        }
        const defaultHash = stableIdHint || window.__md_tel_hashCode(imageUrl).toString(36);
        const defaultFileName = fileNameHint ? `${fileNameHint}_${defaultHash}.jpeg` : `${defaultHash}.jpeg`;
        
        const imageId = "img_" + (Math.random() + 1).toString(36).substring(2, 10) + "_" + Date.now().toString();
        if (window.__md_tel_createProgressBar) {
            window.__md_tel_createProgressBar(imageId, defaultFileName);
        }

        fetch(imageUrl)
        .then(res => {
            if (!res.ok) {
                throw new Error("Image fetch returned status " + res.status);
            }
            return res.blob();
        })
        .then(async (blob) => {
            if (!blob || blob.size === 0) {
                throw new Error("Empty image blob");
            }
            
            let hash = stableIdHint;
            if (!hash) {
                const slice = blob.slice(0, 100000); // hash up to first 100KB for speed
                const arrayBuffer = await slice.arrayBuffer();
                const view = new Uint8Array(arrayBuffer);
                let h = 0;
                for (let i = 0; i < view.length; i++) {
                    h = ((h << 5) - h) + view[i];
                    h |= 0;
                }
                hash = Math.abs(h).toString(36) + blob.size.toString(36);
            }
            
            const fileName = fileNameHint ? `${fileNameHint}_${hash}.jpeg` : `${hash}.jpeg`;
            
            const blobUrl = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            document.body.appendChild(a);
            a.href = blobUrl;
            a.download = fileName;
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(blobUrl);
            logger.info("Image blob download triggered", fileName);

            if (window.__md_tel_updateProgress) window.__md_tel_updateProgress(imageId, fileName, "100");
            if (window.__md_tel_completeProgress) window.__md_tel_completeProgress(imageId);
        })
        .catch(err => {
            logger.info("CORS block or fetch failure (" + err + "), falling back to background download...", defaultFileName);

            if (!chrome || !chrome.runtime || !chrome.runtime.sendMessage) {
                logger.error("Extension context invalidated (chrome.runtime unavailable)", defaultFileName);
                if (window.__md_tel_AbortProgress) window.__md_tel_AbortProgress(imageId);
                if (window.__md_tel_showToast) window.__md_tel_showToast("Download failed: " + defaultFileName, true);
                return;
            }

            chrome.runtime.sendMessage({
                action: "browser_download",
                url: imageUrl,
                filename: defaultFileName
            }, (response) => {
                if (chrome.runtime.lastError) {
                    logger.error("Failed background download: " + chrome.runtime.lastError.message, defaultFileName);
                    if (window.__md_tel_AbortProgress) window.__md_tel_AbortProgress(imageId);
                    if (window.__md_tel_showToast) window.__md_tel_showToast("Download failed: " + defaultFileName, true);
                    return;
                }
                if (response && response.success) {
                    logger.info("Background download triggered", defaultFileName);
                    if (window.__md_tel_updateProgress) window.__md_tel_updateProgress(imageId, defaultFileName, "100");
                    if (window.__md_tel_completeProgress) window.__md_tel_completeProgress(imageId);
                } else {
                    logger.error("Failed background download: " + (response ? response.error : "Unknown"), defaultFileName);
                    if (window.__md_tel_AbortProgress) window.__md_tel_AbortProgress(imageId);
                    if (window.__md_tel_showToast) window.__md_tel_showToast("Download failed: " + defaultFileName, true);
                }
            });
        });
    };
})();
