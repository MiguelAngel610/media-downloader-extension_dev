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

    window.__md_tel_capture_video_element = (videoElement, fileNameHint, stableIdHint) => {
        if (!videoElement || typeof videoElement.captureStream !== "function") {
            logger.error("This browser/element does not support captureStream(); cannot capture video.", fileNameHint);
            if (window.__md_tel_showToast) window.__md_tel_showToast("No se pudo capturar el video (captureStream no soportado)", true);
            return;
        }

        // Pick the best available mimeType. Prefer NATIVE mp4 output (Chrome
        // 105+ supports MediaRecorder recording directly to mp4/H.264) so the
        // result is a real .mp4 file with no extra conversion step. Falls
        // back to webm on browsers that don't support mp4 recording yet.
        const candidateTypes = [
            "video/mp4;codecs=avc1,mp4a",
            "video/mp4;codecs=h264,aac",
            "video/mp4",
            "video/webm;codecs=vp9,opus",
            "video/webm;codecs=vp9",
            "video/webm;codecs=vp8,opus",
            "video/webm",
        ];
        const mimeType = candidateTypes.find(t => window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || "video/webm";
        const outputExt = mimeType.startsWith("video/mp4") ? "mp4" : "webm";

        const videoId = (Math.random() + 1).toString(36).substring(2, 10) + "_" + Date.now().toString();
        
        let hash = stableIdHint;
        if (!hash && videoElement && videoElement.duration) {
            hash = window.__md_tel_hashCode(videoElement.duration + "_" + videoElement.videoWidth + "_" + videoElement.videoHeight).toString(36);
        }
        if (!hash) {
            hash = "video";
            try {
                const src = videoElement.currentSrc || videoElement.src || videoElement.querySelector("source")?.src;
                if (src) hash = window.__md_tel_hashCode(src).toString(36);
            } catch(e){}
        }
        const fileName = window.FilenameFormatter.format(fileNameHint, hash, outputExt);

        if (window.__md_tel_createProgressBar) {
            window.__md_tel_createProgressBar(videoId, fileName);
        }

        const wasPaused = videoElement.paused;
        const originalTime = videoElement.currentTime;
        const originalMuted = videoElement.muted;

        let stream;
        try {
            stream = videoElement.captureStream();
        } catch (e) {
            logger.error("captureStream() failed: " + e, fileName);
            if (window.__md_tel_AbortProgress) window.__md_tel_AbortProgress(videoId);
            return;
        }

        // Scale bitrate to the actual source resolution so we never under-
        // allocate quality for higher-res videos, nor waste size on tiny ones.
        // ~0.1 bits per pixel per frame at 30fps is a generous/high-quality
        // target (well above typical streaming bitrates for the same res).
        const w = videoElement.videoWidth || 1280;
        const h = videoElement.videoHeight || 720;
        const pixelCount = w * h;
        const targetBitrate = Math.min(
            20_000_000, // hard cap to avoid pathological file sizes
            Math.max(8_000_000, Math.round(pixelCount * 30 * 0.12))
        );

        let recorder;
        try {
            recorder = new MediaRecorder(stream, {
                mimeType,
                videoBitsPerSecond: targetBitrate,
            });
        } catch (e) {
            logger.error("MediaRecorder init failed: " + e, fileName);
            if (window.__md_tel_AbortProgress) window.__md_tel_AbortProgress(videoId);
            return;
        }

        const chunks = [];
        let finished = false;

        const cleanupVideoState = () => {
            try {
                videoElement.currentTime = originalTime;
                videoElement.muted = originalMuted;
                if (wasPaused) videoElement.pause();
            } catch (e) {}
        };

        recorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) chunks.push(e.data);
        };

        recorder.onerror = (e) => {
            logger.error("MediaRecorder error: " + (e.error || e), fileName);
            if (window.__md_tel_AbortProgress) window.__md_tel_AbortProgress(videoId);
            cleanupVideoState();
        };

        recorder.onstop = () => {
            if (finished) return; // already handled (e.g. via timeupdate completion)
            finished = true;
            cleanupVideoState();

            if (chunks.length === 0) {
                logger.error("No data captured from video element.", fileName);
                if (window.__md_tel_AbortProgress) window.__md_tel_AbortProgress(videoId);
                return;
            }

            const blob = new Blob(chunks, { type: mimeType.split(";")[0] });
            const blobUrl = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            document.body.appendChild(a);
            a.href = blobUrl;
            a.download = fileName;
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(blobUrl);

            if (window.__md_tel_completeProgress) window.__md_tel_completeProgress(videoId);
            logger.info("Captured video saved as " + fileName, fileName);
        };

        const duration = videoElement.duration;
        const hasFiniteDuration = isFinite(duration) && duration > 0;

        const onTimeUpdate = () => {
            if (hasFiniteDuration && window.__md_tel_updateProgress) {
                const pct = Math.min(100, ((videoElement.currentTime / duration) * 100)).toFixed(0);
                window.__md_tel_updateProgress(videoId, fileName, pct);
            }
            // Stop once we've played through to (approximately) the end.
            if (hasFiniteDuration && videoElement.currentTime >= duration - 0.15) {
                videoElement.removeEventListener("timeupdate", onTimeUpdate);
                if (recorder.state !== "inactive") recorder.stop();
            }
        };

        videoElement.addEventListener("timeupdate", onTimeUpdate);
        videoElement.addEventListener("ended", () => {
            videoElement.removeEventListener("timeupdate", onTimeUpdate);
            if (recorder.state !== "inactive") recorder.stop();
        }, { once: true });

        // Restart from the beginning so we capture the whole clip, muted so
        // the user isn't forced to hear it twice while it captures.
        try {
            videoElement.currentTime = 0;
            videoElement.muted = true;
            recorder.start();
            const playPromise = videoElement.play();
            if (playPromise && playPromise.catch) playPromise.catch(() => {});
        } catch (e) {
            logger.error("Failed to start capture: " + e, fileName);
            if (window.__md_tel_AbortProgress) window.__md_tel_AbortProgress(videoId);
            cleanupVideoState();
            return;
        }

        // Safety timeout in case `duration` is Infinity/unavailable (e.g. some
        // live/stream-like elements) — cap capture at 5 minutes so it can't
        // hang forever.
        if (!hasFiniteDuration) {
            setTimeout(() => {
                if (recorder.state !== "inactive") recorder.stop();
            }, 5 * 60 * 1000);
        }
    };


    // Extracts the post/story date from Telegram's UI for use in filenames
    // (matching the {date:%Y-%m-%d}_... pattern already used in the user's
    // gallery-dl config for other platforms).
    //
    // Telegram's date span text varies depending on recency (English UI):
    //  - "today at 5:42 PM"
    //  - "yesterday at 5:42 PM"
    //  - "Monday at 5:42 PM"      (within the last ~6 days)
    //  - "6/27/2026"              (absolute date, older posts)
    // There is no ISO datetime hidden in any attribute (confirmed by
    // inspection) — only this human-readable text is available, so we must
    // parse it. If the text doesn't match any known pattern (e.g. the UI
    // language changes, or Telegram changes its phrasing), we deliberately
    // return null rather than guessing — callers should fall back to a
    // hash-based filename instead of silently embedding a wrong date.
    window.__md_tel_extract_post_date = (container) => {
        if (!container) return null;
        const pad = (n) => String(n).padStart(2, "0");
        const formatYMD = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

        // 0. Try direct timestamp attributes first (100% exact in any language or chat type)
        const root = container.closest(".media-viewer-whole, #MediaViewer, #StoryViewer, #stories-viewer, [role='dialog'], .Profile, .message, .Message, .bubble") || container;
        const attrEl = root.querySelector("[data-timestamp], [data-time], [data-date], time[datetime]") || root.closest("[data-timestamp], [data-time], [data-date], time[datetime]");
        if (attrEl) {
            const val = attrEl.getAttribute("data-timestamp") || attrEl.getAttribute("data-time") || attrEl.getAttribute("data-date") || attrEl.getAttribute("datetime");
            if (val) {
                let num = Number(val);
                if (!isNaN(num) && val.trim().length > 0) {
                    if (val.length <= 11) num *= 1000; // unix seconds to milliseconds
                    const d = new Date(num);
                    if (!isNaN(d.getTime()) && d.getFullYear() > 2000) return formatYMD(d);
                } else {
                    const d = new Date(val);
                    if (!isNaN(d.getTime()) && d.getFullYear() > 2000) return formatYMD(d);
                }
            }
        }

        // 1. Gather text candidate elements in PRIORITY ORDER, avoiding off-screen elements (hidden sidebars, pre-rendered slides)
        let foundTimeOnly = false;
        
        const parseDateText = (rawText) => {
            if (!rawText) return null;
            const text = rawText.replace(/\u00a0/g, " ").trim();
            if (!text) return null;

            // Absolute date: YYYY-MM-DD, YYYY.MM.DD, etc.
            const isoMatch = text.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})$/);
            if (isoMatch) return `${isoMatch[1]}-${pad(isoMatch[2])}-${pad(isoMatch[3])}`;

            // Absolute date: D/M/YYYY or M/D/YYYY
            const absMatch = text.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})$/);
            if (absMatch) {
                let p1 = parseInt(absMatch[1], 10);
                let p2 = parseInt(absMatch[2], 10);
                let y = parseInt(absMatch[3], 10);
                if (y < 100) y += 2000;

                let m, d;
                if (p1 > 12) {
                    d = p1; m = p2;
                } else if (p2 > 12) {
                    m = p1; d = p2;
                } else {
                    const now = new Date();
                    const dateAsMD = new Date(y, p1 - 1, p2);
                    const dateAsDM = new Date(y, p2 - 1, p1);

                    if (dateAsDM > now && dateAsMD <= now) {
                        m = p1; d = p2;
                    } else if (dateAsMD > now && dateAsDM <= now) {
                        m = p2; d = p1;
                    } else {
                        const lang = (document.documentElement.lang || navigator.language || "").toLowerCase();
                        const pageText = document.body ? document.body.textContent : "";
                        const isEnglish = lang.startsWith("en") || pageText.includes("Saved Messages") || pageText.includes("Search");
                        if (isEnglish && text.includes("/")) {
                            m = p1; d = p2;
                        } else {
                            m = p2; d = p1;
                        }
                    }
                }
                if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
                    return `${y}-${pad(m)}-${pad(d)}`;
                }
            }

            const monthNamesEn = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
            const monthNamesEs = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];

            // Match "15 de jul. de 2025", "15 jul 2025", "15 de julio"
            const dayMonthMatch = text.match(/(\d{1,2})\s*(?:de\s*)?([a-záéíóú]{3,10})\.?\s*(?:(?:de|,)?\s*(\d{4}))?/i);
            if (dayMonthMatch) {
                const mStr = dayMonthMatch[2].toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").substring(0, 3);
                let mIdx = monthNamesEs.indexOf(mStr);
                if (mIdx === -1) mIdx = monthNamesEn.indexOf(mStr);
                if (mIdx !== -1) {
                    const day = pad(parseInt(dayMonthMatch[1], 10));
                    const year = dayMonthMatch[3] || new Date().getFullYear();
                    return `${year}-${pad(mIdx + 1)}-${day}`;
                }
            }

            // Match "Jun 18, 02:28 PM" or "July 15, 2025"
            const monthDayMatch = text.match(/([a-z]{3,9})\s+(\d{1,2})(?:,?\s*(\d{4}))?/i);
            if (monthDayMatch) {
                const mStr = monthDayMatch[1].toLowerCase().substring(0, 3);
                let mIdx = monthNamesEn.indexOf(mStr);
                if (mIdx === -1) mIdx = monthNamesEs.indexOf(mStr);
                if (mIdx !== -1) {
                    const day = pad(parseInt(monthDayMatch[2], 10));
                    const year = monthDayMatch[3] || new Date().getFullYear();
                    return `${year}-${pad(mIdx + 1)}-${day}`;
                }
            }

            // Relative dates: "hoy a las...", "ayer..."
            const relMatch = text.match(/^(today|yesterday|hoy|ayer|sunday|monday|tuesday|wednesday|thursday|friday|saturday|domingo|lunes|martes|miércoles|miercoles|jueves|viernes|sábado|sabado|sun|mon|tue|wed|thu|fri|sat|dom|lun|mar|mie|jue|vie|sab)\b/i);
            if (relMatch) {
                const kw = relMatch[1].toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                const now = new Date();
                if (kw === "today" || kw === "hoy") return formatYMD(now);
                if (kw === "yesterday" || kw === "ayer") {
                    const d = new Date(now);
                    d.setDate(d.getDate() - 1);
                    return formatYMD(d);
                }
                const weekdaysEn = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
                const weekdaysEs = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];
                const weekdaysEnShort = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
                const weekdaysEsShort = ["dom", "lun", "mar", "mie", "jue", "vie", "sab"];
                
                let targetIdx = weekdaysEn.indexOf(kw);
                if (targetIdx === -1) targetIdx = weekdaysEs.indexOf(kw);
                if (targetIdx === -1) targetIdx = weekdaysEnShort.indexOf(kw);
                if (targetIdx === -1) targetIdx = weekdaysEsShort.indexOf(kw);
                
                if (targetIdx !== -1) {
                    const d = new Date(now);
                    for (let i = 1; i <= 7; i++) {
                        d.setDate(d.getDate() - 1);
                        if (d.getDay() === targetIdx) return formatYMD(d);
                    }
                }
            }

            // Time-only display in private chats and DMs
            if (/^\d{1,2}:\d{2}(?:\s*(?:AM|PM|am|pm))?$/.test(text)) {
                return "TIME_ONLY";
            }

            return null;
        };

        const prioritySelectors = [
            ".media-viewer-subtitle, .media-header-subtitle, .StoryViewer-subtitle, div[class*='subtitle'], div[class*='SubTitle']",
            "time, [class*='time'], [class*='Time'], .date, [class*='date'], [class*='Date']",
            ".MessageMeta, .sub-text, .meta, span.O6fpaxCe, span, p"
        ];

        for (let sel of prioritySelectors) {
            const els = Array.from(root.querySelectorAll(sel));
            for (let el of els) {
                // Strict Spatial Filter: Ensure the element is actually visible on screen right now!
                // This prevents stealing dates from hidden sidebars, previous days' dividers, or off-screen pre-rendered slides.
                let r = el.getBoundingClientRect();
                if (r.width === 0 || r.height === 0 || r.top > window.innerHeight || r.bottom < 0 || r.left > window.innerWidth || r.right < 0) {
                    continue;
                }

                const parsed = parseDateText(el.getAttribute("title")) || parseDateText(el.getAttribute("aria-label")) || parseDateText(el.textContent);
                if (parsed === "TIME_ONLY") foundTimeOnly = true;
                else if (parsed) return parsed;
            }
        }

        // 3. Date Divider Fallback: If we only found a time string (e.g. "21:45") and no full date in titles, 
        // traverse up the DOM to find the preceding Date Separator in the chat feed.
        if (foundTimeOnly) {
            const messageNode = container.closest('.message, .Message, .bubble');
            if (messageNode) {
                let current = messageNode;
                let climbs = 0;
                while (current && climbs < 25) {
                    let prev = current.previousElementSibling;
                    while (prev) {
                        if (prev.classList.contains('date-divider') || 
                            prev.classList.contains('is-date-divider') || 
                            prev.classList.contains('MessageList-date-separator') ||
                            prev.classList.contains('ActionMessage') ||
                            prev.querySelector('.date-divider, .is-date-divider, .MessageList-date-separator, .ActionMessage') ||
                            (prev.classList.contains('service') && prev.textContent.trim().length > 0 && prev.textContent.trim().length < 30)) {
                            
                            let divText = prev.textContent;
                            let parsed = parseDateText(divText);
                            if (parsed && parsed !== "TIME_ONLY") return parsed;
                        }
                        prev = prev.previousElementSibling;
                    }
                    current = current.parentElement;
                    climbs++;
                }
            }
            return formatYMD(new Date()); // Absolute fallback to today if no separator is found
        }

        return null;
    };

    window.__md_tel_extract_post_id = (container) => {
        if (!container) return null;
        
        const root = container.closest(".media-viewer-whole, #MediaViewer, #StoryViewer, #stories-viewer, [role='dialog'], .Profile, .message, .Message, .bubble") || container;

        const msg = root.closest(".message, .Message, .bubble, [data-msg-id], [data-mid], [data-message-id], [data-post-id], [data-story-id], [data-id], [data-media-id], [id*='message'], [id*='post-']") || 
                    root.querySelector("[data-mid], [data-msg-id], [data-message-id], [data-post-id], [data-story-id], [data-id], [data-media-id], [data-photo-id], [data-video-id], [id*='message'], [id*='post-'], .message, .Message, .bubble");
        if (msg) {
            if (msg.hasAttribute("data-mid")) return msg.getAttribute("data-mid");
            if (msg.hasAttribute("data-msg-id")) return msg.getAttribute("data-msg-id");
            if (msg.hasAttribute("data-message-id")) return msg.getAttribute("data-message-id");
            if (msg.hasAttribute("data-id")) return msg.getAttribute("data-id");
            if (msg.hasAttribute("data-media-id")) return msg.getAttribute("data-media-id");
            if (msg.hasAttribute("data-photo-id")) return msg.getAttribute("data-photo-id");
            if (msg.hasAttribute("data-video-id")) return msg.getAttribute("data-video-id");
            if (msg.hasAttribute("data-post-id")) return msg.getAttribute("data-post-id");
            if (msg.hasAttribute("data-story-id")) return msg.getAttribute("data-story-id");
            if (msg.id && (msg.id.includes("message") || msg.id.includes("post") || msg.id.includes("story") || msg.id.includes("media"))) {
                const num = msg.id.replace(/\D/g, "");
                if (num && num.length > 0) return num;
            }
        }

        const link = root.querySelector("a[href*='/'], a[href*='#']");
        if (link) {
            const m = link.getAttribute("href").match(/(?:[_/]|(?:msg_|message|post|story)(?:_id)?=)(\d{2,})(?:[?&/#]|$)/i);
            if (m && m[1]) return m[1];
        }

        const urlStr = window.location.href;
        const hashMatch = urlStr.match(/(?:msg_id|message|post_id|story_id)=?(\d+)/i) || urlStr.match(/(?:[_/])(\d{2,})(?:[?&/#]|$)/);
        if (hashMatch) return hashMatch[1];

        return null;
    };

    window.__md_tel_hashCode = (s) => {
        var h = 0, l = s.length, i = 0;
        if (l > 0) {
            while (i < l) {
                h = ((h << 5) - h + s.charCodeAt(i++)) | 0;
            }
        }
        return h >>> 0;
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

    // Resolves the maximum resolution image element/source within any Telegram container or relative to any element.
    // By sorting candidates by intrinsic pixel count (naturalWidth * naturalHeight) and rejecting compressed thumbnails,
    // we guarantee downloading the highest quality original asset loaded by Telegram's web client.
    window.__md_tel_find_best_image = (container) => {
        if (!container) return null;

        // If an img element was passed directly, expand search to its enclosing media viewer or bubble root
        // so that if a low-res thumbnail was intercepted, we find its companion high-resolution image.
        const root = (container.tagName && container.tagName.toLowerCase() === "img")
            ? (container.closest(".media-viewer-whole, #MediaViewer, #StoryViewer, #stories-viewer, [role='dialog'], .bubble, .message, .Message, .MediaViewerContent, .media-aspect-ratio, .media-container, .Media, .Album") || container.parentElement || container)
            : container;

        let imgs = Array.from(root.querySelectorAll ? root.querySelectorAll("img") : []);
        if (root.tagName && root.tagName.toLowerCase() === "img" && !imgs.includes(root)) {
            imgs.push(root);
        }

        // Filter out avatars, icons, emojis, headers, and data URLs
        imgs = imgs.filter(im => {
            const src = im.currentSrc || im.src || "";
            if (!src || src.startsWith("data:") || src === window.location.href) return false;
            if (im.closest("header, [class*='Header'], [class*='avatar'], [class*='Avatar'], .avatar, [class*='ProfilePhoto-thumb'], .emoji, .reaction, .peer-title") && !root.classList?.contains("avatar") && !root.className?.toString().toLowerCase().includes("avatar")) {
                return false;
            }
            
            // Constrain to only the currently visible slide in carousels
            const r = im.getBoundingClientRect();
            if (r.width === 0 && r.height === 0) return false;
            if (r.right < -50 || r.left > window.innerWidth + 50) return false; // Completely off-screen horizontally
            if (r.bottom < -50 || r.top > window.innerHeight + 50) return false; // Completely off-screen vertically
            
            const webzSlide = im.closest(".MediaViewerSlide");
            if (webzSlide && !webzSlide.classList.contains("MediaViewerSlide--active")) return false;

            return true;
        });

        if (imgs.length === 0) return null;

        // Resolve best possible URL for each image candidate (checking srcset, data attributes, and picture sources)
        const candidates = imgs.map(im => {
            let src = im.getAttribute("data-original-src") || im.getAttribute("data-full-src") || im.getAttribute("data-src");
            if (!src) {
                const parentPicture = im.parentElement && im.parentElement.tagName && im.parentElement.tagName.toLowerCase() === "picture" ? im.parentElement : null;
                const sourceEl = parentPicture ? parentPicture.querySelector("source[srcset], source[src]") : null;
                const srcset = im.srcset || (sourceEl ? sourceEl.getAttribute("srcset") : null);
                if (srcset) {
                    const parts = srcset.split(",").map(s => s.trim());
                    let bestScore = -1;
                    for (const part of parts) {
                        const tokens = part.split(/\s+/);
                        const url = tokens[0];
                        const score = parseFloat(tokens[1] || "1") || 1;
                        if (score > bestScore) {
                            bestScore = score;
                            src = url;
                        }
                    }
                }
            }
            if (!src) src = im.currentSrc || im.src || "";

            const isThumbnail = im.classList.contains("thumbnail") || im.className.toString().toLowerCase().includes("thumb") || im.className.toString().toLowerCase().includes("blur");
            const pixels = (im.naturalWidth || 0) * (im.naturalHeight || 0);
            const rect = im.getBoundingClientRect ? im.getBoundingClientRect() : { width: 0, height: 0 };
            const area = rect.width * rect.height;

            return { el: im, src, isThumbnail, pixels, area };
        });

        // Sort candidates:
        // 1. Prefer non-thumbnail over thumbnail
        // 2. Prefer highest natural pixel count (naturalWidth * naturalHeight)
        // 3. Prefer largest display bounding box on screen
        candidates.sort((a, b) => {
            if (a.isThumbnail !== b.isThumbnail) {
                return a.isThumbnail ? 1 : -1;
            }
            if (b.pixels !== a.pixels) {
                return b.pixels - a.pixels;
            }
            return b.area - a.area;
        });

        const winner = candidates[0];
        return winner ? { el: winner.el, src: winner.src, naturalWidth: winner.el.naturalWidth, naturalHeight: winner.el.naturalHeight } : null;
    };

    // Resolves the maximum resolution video element within any Telegram container or relative to any element.
    // By sorting candidates by video dimensions (videoWidth * videoHeight), source width attributes, and display dimensions,
    // we ensure the highest available resolution stream is selected for download.
    window.__md_tel_find_best_video = (container) => {
        if (!container) return null;

        const root = (container.tagName && container.tagName.toLowerCase() === "video")
            ? (container.closest(".media-viewer-whole, #MediaViewer, #StoryViewer, #stories-viewer, [role='dialog'], .bubble, .message, .Message, .MediaViewerContent, .media-aspect-ratio, .media-container, .Media, .Album") || container.parentElement || container)
            : container;

        let videos = Array.from(root.querySelectorAll ? root.querySelectorAll("video") : []);
        if (root.tagName && root.tagName.toLowerCase() === "video" && !videos.includes(root)) {
            videos.push(root);
        }

        videos = videos.filter(v => {
            const src = v.currentSrc || v.src || v.querySelector("source")?.src || "";
            if (!src || src === window.location.href) return false;
            
            // Constrain to only the currently visible slide in carousels
            const r = v.getBoundingClientRect();
            if (r.width === 0 && r.height === 0) return false;
            if (r.right < -50 || r.left > window.innerWidth + 50) return false; // Completely off-screen horizontally
            if (r.bottom < -50 || r.top > window.innerHeight + 50) return false; // Completely off-screen vertically
            
            const webzSlide = v.closest(".MediaViewerSlide");
            if (webzSlide && !webzSlide.classList.contains("MediaViewerSlide--active")) return false;

            return true;
        });

        if (videos.length === 0) return null;

        const candidates = videos.map(v => {
            const pixels = (v.videoWidth || 0) * (v.videoHeight || 0);
            const rect = v.getBoundingClientRect ? v.getBoundingClientRect() : { width: 0, height: 0 };
            const area = rect.width * rect.height;
            let maxSourceWidth = 0;
            v.querySelectorAll("source").forEach(s => {
                const w = parseInt(s.getAttribute("width") || "0", 10);
                if (w > maxSourceWidth) maxSourceWidth = w;
            });
            return { el: v, pixels, area, maxSourceWidth };
        });

        candidates.sort((a, b) => {
            if (b.pixels !== a.pixels) return b.pixels - a.pixels;
            if (b.maxSourceWidth !== a.maxSourceWidth) return b.maxSourceWidth - a.maxSourceWidth;
            return b.area - a.area;
        });

        return candidates[0] ? candidates[0].el : null;
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
