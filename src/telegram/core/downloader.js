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
        let _blobs = [];
        let _next_offset = 0;
        let _total_size = null;
        let _file_extension = "mp4";

        const videoId = (Math.random() + 1).toString(36).substring(2, 10) + "_" + Date.now().toString();
        let fileName = window.__md_tel_hashCode(url).toString(36) + "." + _file_extension;

        try {
            const metadata = JSON.parse(decodeURIComponent(url.split("/")[url.split("/").length - 1]));
            if (metadata.fileName) {
                fileName = metadata.fileName;
            }
        } catch (e) {}

        logger.info(`URL: ${url}`, fileName);

        const fetchNextPart = (_writable) => {
            fetch(url, {
                method: "GET",
                credentials: "include",
                headers: {
                    Range: `bytes=${_next_offset}-`,
                },
            })
            .then((res) => {
                if ([301, 302, 303, 307, 308].includes(res.status)) {
                    const location = res.headers.get("Location");
                    if (location) {
                        url = location;
                        fetchNextPart(_writable);
                        return Promise.reject("REDIRECT");
                    }
                }
                
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
                    // Si no hay Content-Range, pero es 200, es el archivo completo.
                    if (res.status === 200 && _next_offset === 0) {
                        const totalSize = parseInt(res.headers.get("Content-Length") || "0");
                        // If Content-Length is missing, we just set totalSize to a dummy value 
                        // and set _next_offset to equal it so it stops looping.
                        _total_size = totalSize || 1;
                        _next_offset = _total_size; 
                        
                        if (window.__md_tel_updateProgress) {
                            window.__md_tel_updateProgress(videoId, fileName, "100");
                        }
                        return res.blob();
                    }
                    throw new Error("Missing Content-Range header");
                }

                const match = contentRange.match(contentRangeRegex);
                const startOffset = parseInt(match[1]);
                const endOffset = parseInt(match[2]);
                const totalSize = parseInt(match[3]);

                if (startOffset !== _next_offset) {
                    throw new Error("Gap detected between responses.");
                }
                if (_total_size && totalSize !== _total_size) {
                    throw new Error("Total size differs");
                }

                _next_offset = endOffset + 1;
                _total_size = totalSize;

                if (window.__md_tel_updateProgress) {
                    window.__md_tel_updateProgress(videoId, fileName, ((_next_offset * 100) / _total_size).toFixed(0));
                }
                return res.blob();
            })
            .then((resBlob) => {
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
                    fetchNextPart(_writable);
                } else {
                    if (_writable !== null) {
                        _writable.close().then(() => {});
                    } else {
                        save();
                    }
                    if (window.__md_tel_completeProgress) window.__md_tel_completeProgress(videoId);
                }
            })
            .catch((reason) => {
                if (reason === "REDIRECT") return;
                logger.error("Fetch failed: " + reason, fileName);
                
                // Fallback to background download for the entire file if chunking fails
                logger.info("Falling back to background download for video...", fileName);
                chrome.runtime.sendMessage({
                    action: "browser_download",
                    url: url,
                    filename: fileName
                }, (response) => {
                    if (response && response.success) {
                        logger.info("Background video download triggered", fileName);
                        if (window.__md_tel_completeProgress) window.__md_tel_completeProgress(videoId);
                    } else {
                        logger.error("Failed background video download: " + (response ? response.error : "Unknown"), fileName);
                        if (window.__md_tel_AbortProgress) window.__md_tel_AbortProgress(videoId);
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
        .then(res => res.blob())
        .then(blob => {
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
            logger.info("CORS block detected, falling back to background download...", fileName);
            chrome.runtime.sendMessage({
                action: "browser_download",
                url: imageUrl,
                filename: fileName
            }, (response) => {
                if (response && response.success) {
                    logger.info("Background download triggered", fileName);
                } else {
                    logger.error("Failed background download", fileName);
                }
            });
        });
    };
})();
