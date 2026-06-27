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

    window.__md_tel_hashCode = (s) => {
        var h = 0, l = s.length, i = 0;
        if (l > 0) {
            while (i < l) {
                h = ((h << 5) - h + s.charCodeAt(i++)) | 0;
            }
        }
        return h >>> 0;
    };

    window.__md_tel_download_video = (url) => {
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
        let fileName = window.__md_tel_hashCode(url).toString(36) + "." + _file_extension;

        try {
            const metadata = JSON.parse(decodeURIComponent(url.split("/")[url.split("/").length - 1]));
            if (metadata.fileName) {
                fileName = metadata.fileName;
            }
        } catch (e) {}

        logger.info(`URL: ${url}`, fileName);

        // Cleans up a partially-written file so we never leave a truncated artifact on disk.
        const abortWritable = (_writable) => {
            if (_writable && typeof _writable.abort === "function") {
                _writable.abort().catch(() => {});
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

            return fetch(url, {
                method: "GET",
                credentials: "include",
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

    window.__md_tel_download_audio = (url) => {
        let _blobs = [];
        let _next_offset = 0;
        let _total_size = null;
        const fileName = window.__md_tel_hashCode(url).toString(36) + ".ogg";

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

    window.__md_tel_download_image = (imageUrl) => {
        const fileName = (Math.random() + 1).toString(36).substring(2, 10) + ".jpeg";
        
        fetch(imageUrl)
        .then(res => {
            if (!res.ok) {
                throw new Error("Image fetch returned status " + res.status);
            }
            return res.blob();
        })
        .then(blob => {
            if (!blob || blob.size === 0) {
                throw new Error("Empty image blob");
            }
            const blobUrl = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            document.body.appendChild(a);
            a.href = blobUrl;
            a.download = fileName;
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(blobUrl);
            logger.info("Image blob download triggered", fileName);
        })
        .catch(err => {
            logger.info("CORS block or fetch failure (" + err + "), falling back to background download...", fileName);

            if (!chrome || !chrome.runtime || !chrome.runtime.sendMessage) {
                logger.error("Extension context invalidated (chrome.runtime unavailable)", fileName);
                if (window.__md_tel_showToast) window.__md_tel_showToast("Download failed: " + fileName, true);
                return;
            }

            chrome.runtime.sendMessage({
                action: "browser_download",
                url: imageUrl,
                filename: fileName
            }, (response) => {
                if (chrome.runtime.lastError) {
                    logger.error("Failed background download: " + chrome.runtime.lastError.message, fileName);
                    if (window.__md_tel_showToast) window.__md_tel_showToast("Download failed: " + fileName, true);
                    return;
                }
                if (response && response.success) {
                    logger.info("Background download triggered", fileName);
                } else {
                    logger.error("Failed background download: " + (response ? response.error : "Unknown"), fileName);
                    if (window.__md_tel_showToast) window.__md_tel_showToast("Download failed: " + fileName, true);
                }
            });
        });
    };
})();
