// src/telegram/utils/media_resolver.js
(function() {
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
})();
