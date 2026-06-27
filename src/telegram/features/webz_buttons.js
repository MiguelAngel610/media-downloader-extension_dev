// src/telegram/features/webz_buttons.js
(function() {
    window.__md_tel_initWebZ = () => {
        // For webz /a/ webapp
    setInterval(() => {
        const DOWNLOAD_ICON = "\ue979";

        // --- 1. STORIES ---
        const storiesContainer = document.getElementById("StoryViewer");
        if (storiesContainer) {
            const createDownloadButton = () => {
                const downloadIcon = document.createElement("i");
                downloadIcon.className = "icon icon-download";
                const downloadButton = document.createElement("button");
                downloadButton.className = "Button TkphaPyQ tiny translucent-white round tel-download";
                downloadButton.appendChild(downloadIcon);
                downloadButton.setAttribute("type", "button");
                downloadButton.setAttribute("title", "Download");
                downloadButton.setAttribute("aria-label", "Download");
                downloadButton.onclick = () => {
                    const video = storiesContainer.querySelector("video");
                    const videoSrc = video?.src || video?.currentSrc || video?.querySelector("source")?.src;
                    if (videoSrc) {
                        window.__md_tel_download_video(videoSrc);
                        return;
                    }

                    // NOTE: we used to rely on a hashed CSS-module class name here
                    // (e.g. "img.PVZ8TOWS"). Telegram regenerates those hashes on
                    // every frontend build, so the selector silently stops matching
                    // anything after an update — no error, the button just does
                    // nothing. We now resolve the post image structurally instead.
                    //
                    // IMPORTANT: the viewer header contains a small circular avatar
                    // (profile picture) — a naive ".active"/largest-image heuristic
                    // can grab that instead of the actual post media. We explicitly
                    // exclude header/avatar regions and require the image to cover a
                    // large fraction of the viewport (the post media always does;
                    // the avatar never does).
                    let imageSrc = null;

                    const isInHeaderOrAvatar = (el) => {
                        return !!el.closest(
                            "header, [class*='Header'], [class*='avatar'], [class*='Avatar'], [class*='Profile']"
                        );
                    };

                    const viewportArea = window.innerWidth * window.innerHeight;

                    const candidates = Array.from(storiesContainer.querySelectorAll("img")).filter((im) => {
                        if (!im.src || im.src.startsWith("data:")) return false;
                        if (isInHeaderOrAvatar(im)) return false;
                        const rect = im.getBoundingClientRect();
                        if (rect.width < 100 || rect.height < 100) return false;
                        // The real post/story image should take up a meaningful chunk
                        // of the screen (it's the main viewer content). A small avatar
                        // would never pass this bar even if it slipped past the
                        // header/avatar class check above.
                        const area = rect.width * rect.height;
                        return area > viewportArea * 0.15;
                    });

                    candidates.sort((a, b) => {
                        const ra = a.getBoundingClientRect();
                        const rb = b.getBoundingClientRect();
                        return (rb.width * rb.height) - (ra.width * ra.height);
                    });

                    if (candidates.length > 0) imageSrc = candidates[0].src;

                    if (imageSrc) {
                        window.__md_tel_download_image(imageSrc);
                    } else if (window.__md_tel_showToast) {
                        window.__md_tel_showToast("No se encontró la imagen para descargar", true);
                    } else if (window.__md_tel_logger) {
                        window.__md_tel_logger.error("Could not locate story/post image to download.");
                    }
                };
                return downloadButton;
            };

            const storyHeader = storiesContainer.querySelector(".GrsJNw3y") || storiesContainer.querySelector(".DropdownMenu")?.parentNode;
            if (storyHeader && !storyHeader.querySelector(".tel-download")) {
                storyHeader.prepend(createDownloadButton());
            }
        }

        // --- 2. MEDIA VIEWER (CHANNELS/CHATS) ---
        const mediaContainer = document.querySelector("#MediaViewer .MediaViewerSlide--active");
        const mediaViewerActions = document.querySelector("#MediaViewer .MediaViewerActions");
        if (!mediaContainer || !mediaViewerActions) return;

        // Check if there is a VISIBLE native download button
        let nativeBtn = null;
        const allNativeBtns = mediaViewerActions.querySelectorAll("button");
        for (const btn of allNativeBtns) {
            if (btn.classList.contains("tel-download")) continue;
            if (btn.title === "Download" || btn.classList.contains("tgico-download") || btn.textContent.includes(DOWNLOAD_ICON)) {
                if (!btn.classList.contains("hide") && getComputedStyle(btn).display !== "none") {
                    nativeBtn = btn;
                    break;
                }
            }
        }

        const videoPlayer = mediaContainer.querySelector(".MediaViewerContent > .VideoPlayer");
        const img = mediaContainer.querySelector("img");
        const videoUrl = videoPlayer ? (videoPlayer.querySelector("video")?.currentSrc || videoPlayer.querySelector("video")?.src) : null;

        // If there IS a visible native button, don't inject a duplicate — but DO wire
        // our reliable download engine onto it instead of trusting Telegram's native
        // download (which, per project notes, silently fails on cross-origin images
        // due to browser CORS blocking of `<a download>`).
        if (nativeBtn) {
            const existingOurBtn = mediaViewerActions.querySelector("button.tel-download");
            if (existingOurBtn) existingOurBtn.remove();

            if (!nativeBtn.__md_tel_wired) {
                nativeBtn.__md_tel_wired = true;
                nativeBtn.addEventListener("click", (e) => {
                    if (videoUrl) {
                        e.preventDefault();
                        e.stopPropagation();
                        window.__md_tel_download_video(videoUrl);
                    } else if (img && img.src) {
                        e.preventDefault();
                        e.stopPropagation();
                        window.__md_tel_download_image(img.src);
                    }
                }, true);
            }
            return;
        }

        // If no visible native button (Restricted Channel), inject ours
        const injectOurButton = () => {
            let downloadButton = mediaViewerActions.querySelector("button.tel-download");
            if (!downloadButton) {
                const downloadIcon = document.createElement("i");
                downloadIcon.className = "icon icon-download";
                downloadButton = document.createElement("button");
                downloadButton.className = "Button smaller translucent-white round tel-download";
                downloadButton.appendChild(downloadIcon);
                downloadButton.setAttribute("type", "button");
                downloadButton.setAttribute("title", "Download");
                downloadButton.setAttribute("aria-label", "Download");
                mediaViewerActions.prepend(downloadButton);
            }
            return downloadButton;
        };

        if (videoPlayer) {
            if (!videoUrl) return;
            
            const btn = injectOurButton();
            btn.setAttribute("data-tel-download-url", videoUrl);
            btn.onclick = () => {
                window.__md_tel_download_video(videoUrl);
            };
        } else if (img && img.src) {
            const btn = injectOurButton();
            btn.setAttribute("data-tel-download-url", img.src);
            btn.onclick = () => {
                window.__md_tel_download_image(img.src);
            };
        }
    }, 500);
    };
    
    // Universal Interceptor for broken native download buttons in unknown viewers (like Profiles)
    document.addEventListener("click", (e) => {
        const btn = e.target.closest("button");
        if (!btn) return;
        if (btn.classList.contains("tel-download")) return; // Ignore our own buttons
        
        // DO NOT intercept if the button is inside a standard media viewer where the native button works!
        if (btn.closest(".media-viewer-whole") || btn.closest("#MediaViewer")) return;

        const DOWNLOAD_ICON = "\ue979";
        const isDownloadBtn = btn.classList.contains("tgico-download") || 
                              btn.title === "Download" || 
                              btn.getAttribute("aria-label") === "Download" ||
                              btn.textContent.includes(DOWNLOAD_ICON);

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
            // (the full-resolution file is normally only fetched once the native
            // media viewer opens, which this interceptor intentionally bypasses).
            const resolveBestSrc = (el) => {
                if (el.tagName === "VIDEO") {
                    const src = el.currentSrc || el.src || el.querySelector("source")?.src || "";
                    if (!src || src === window.location.href) return "";
                    return src;
                }

                const highResAttr = el.getAttribute("data-original-src") ||
                                    el.getAttribute("data-full-src") ||
                                    el.getAttribute("data-src");
                if (highResAttr) return highResAttr;

                if (el.srcset) {
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

                return el.currentSrc || el.src || "";
            };

            const src = resolveBestSrc(targetMedia);

            if (src) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();

                if (targetMedia.tagName === "VIDEO") {
                    window.__md_tel_download_video(src);
                } else {
                    window.__md_tel_download_image(src);
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
