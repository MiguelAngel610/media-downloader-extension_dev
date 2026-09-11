// src/telegram/features/universal_interceptor.js
(function() {
    // Universal Interceptor for broken native download buttons in unknown viewers (like Profiles, restricted groups, etc)
    // This runs for both WebK and WebZ.
    document.addEventListener("click", (e) => {
        const btn = e.target.closest("button");
        if (!btn) return;
        if (btn.classList.contains("tel-download")) return; // Ignore our own buttons
        
        // DO NOT intercept if the button is inside a standard media viewer where the native button works!
        if (btn.closest(".media-viewer-whole") || btn.closest("#MediaViewer")) return;

        const title = btn.title || btn.getAttribute("aria-label") || "";
        const isDownloadBtn = btn.classList.contains("tgico-download") || 
                              btn.querySelector(".icon-download") ||
                              title === "Download" || title === "Descargar";

        if (isDownloadBtn) {
            // Find all visible images and videos
            const allMedia = Array.from(document.querySelectorAll("img, video")).filter(el => {
                const rect = el.getBoundingClientRect();
                return rect.width > 50 && rect.height > 50 && rect.top >= 0 && rect.left >= 0;
            });
            
            if (allMedia.length === 0) return;

            // Sort by largest area (most likely the main media)
            allMedia.sort((a, b) => {
                const rectA = a.getBoundingClientRect();
                const rectB = b.getBoundingClientRect();
                return (rectB.width * rectB.height) - (rectA.width * rectA.height);
            });

            const targetMedia = allMedia[0];

            // Resolve the best available source instead of blindly trusting .src,
            // which in profile/shared-media grids is frequently a low-res thumbnail
            const resolveBestSrc = (el) => {
                if (el.tagName === "VIDEO") {
                    const src = el.currentSrc || el.src || el.querySelector("source")?.src || "";
                    if (!src || src === window.location.href) return "";
                    return src;
                }

                // IMG: prefer an explicit high-res hint if present.
                const highResAttr = el.getAttribute("data-original-src") ||
                                    el.getAttribute("data-full-src") ||
                                    el.getAttribute("data-src");
                if (highResAttr) return highResAttr;

                if (el.srcset) {
                    // Pick the highest-density/widest candidate from srcset.
                    const candidates = el.srcset.split(",").map(s => s.trim());
                    let best = null;
                    let bestScore = -1;
                    for (const c of candidates) {
                        const parts = c.split(/\s+/);
                        const url = parts[0];
                        const descriptor = parts[1] || "1x";
                        const score = parseFloat(descriptor) || 1;
                        if (score > bestScore) {
                            bestScore = score;
                            best = url;
                        }
                    }
                    if (best) return best;
                }

                const src = el.currentSrc || el.src || "";
                return src;
            };

            const src = resolveBestSrc(targetMedia);
            
            const msgContainer = btn.closest(".bubble, .message, .Message, .media-container, .Media, .Album, .media-viewer-whole, #MediaViewer, #StoryViewer, #stories-viewer, [role='dialog'], .Profile") || 
                                 (targetMedia ? targetMedia.closest(".bubble, .message, .Message, .media-container, .Media, .Album, .media-viewer-whole, #MediaViewer, #StoryViewer, #stories-viewer, [role='dialog'], .Profile") : null) || 
                                 document.body;
            
            const dateStr = window.__md_tel_extract_post_date ? window.__md_tel_extract_post_date(msgContainer) : null;
            const postId = window.__md_tel_extract_post_id ? window.__md_tel_extract_post_id(msgContainer) : null;
            const hint = dateStr ? dateStr : null;

            if (src) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();

                if (targetMedia.tagName.toLowerCase() === "video") {
                    const bestVideo = window.__md_tel_find_best_video ? window.__md_tel_find_best_video(targetMedia) : null;
                    if (window.__md_tel_download_video_smart) window.__md_tel_download_video_smart(bestVideo || targetMedia, hint, postId);
                } else {
                    const bestImg = window.__md_tel_find_best_image ? window.__md_tel_find_best_image(targetMedia) : null;
                    if (window.__md_tel_download_image) window.__md_tel_download_image(bestImg ? bestImg.src : src, hint, postId);
                }
            } else {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                if (window.__md_tel_logger) window.__md_tel_logger.error("Could not resolve a valid media source to download.");
                if (window.__md_tel_showToast) window.__md_tel_showToast("No se pudo descargar: fuente no encontrada", true);
            }
        }
    }, true);
})();
