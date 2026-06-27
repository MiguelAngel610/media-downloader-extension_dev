// src/telegram/features/webk_buttons.js
(function() {
    window.__md_tel_initWebK = () => {
        setInterval(() => {
        const DOWNLOAD_ICON = "\ue979";
        const FORWARD_ICON = "\ue99a";

        /* Voice Message or Circle Video */
        const pinnedAudio = document.body.querySelector(".pinned-audio");
        let dataMid;
        let downloadButtonPinnedAudio = document.body.querySelector("._tel_download_button_pinned_container") || document.createElement("button");
        if (pinnedAudio) {
            dataMid = pinnedAudio.getAttribute("data-mid");
            downloadButtonPinnedAudio.className = "btn-icon tgico-download _tel_download_button_pinned_container";
            downloadButtonPinnedAudio.innerHTML = `<span class="tgico button-icon">${DOWNLOAD_ICON}</span>`;
        }
        
        const audioElements = document.body.querySelectorAll("audio-element");
        audioElements.forEach((audioElement) => {
            const bubble = audioElement.closest(".bubble");
            if (!bubble || bubble.querySelector("._tel_download_button_pinned_container")) {
                return;
            }
            if (dataMid && downloadButtonPinnedAudio.getAttribute("data-mid") !== dataMid && audioElement.getAttribute("data-mid") === dataMid) {
                const link = audioElement.audio && audioElement.audio.getAttribute("src");
                const isAudio = audioElement.audio && audioElement.audio instanceof HTMLAudioElement;
                downloadButtonPinnedAudio.onclick = (e) => {
                    e.stopPropagation();
                    if (isAudio) {
                        window.__md_tel_download_audio(link);
                    } else {
                        window.__md_tel_download_video(link);
                    }
                };
                downloadButtonPinnedAudio.setAttribute("data-mid", dataMid);
                if (link) {
                    const utilsWrapper = pinnedAudio.querySelector(".pinned-container-wrapper-utils");
                    if (utilsWrapper) utilsWrapper.appendChild(downloadButtonPinnedAudio);
                }
            }
        });

        // Stories
        const storiesContainer = document.getElementById("stories-viewer");
        if (storiesContainer) {
            const createDownloadButton = () => {
                const downloadButton = document.createElement("button");
                downloadButton.className = "btn-icon rp tel-download";
                downloadButton.innerHTML = `<span class="tgico">${DOWNLOAD_ICON}</span><div class="c-ripple"></div>`;
                downloadButton.setAttribute("type", "button");
                downloadButton.setAttribute("title", "Download");
                downloadButton.setAttribute("aria-label", "Download");
                downloadButton.onclick = () => {
                    // 1. Story with video
                    const video = storiesContainer.querySelector("video.media-video");
                    const videoSrc = video?.src || video?.currentSrc || video?.querySelector("source")?.src;
                    if (videoSrc) {
                        window.__md_tel_download_video(videoSrc);
                        return;
                    }

                    // 2. Story with image
                    let imageSrc = storiesContainer.querySelector("img.media-photo")?.src;

                    // Fallback: structural lookup, in case this viewer instance (e.g.
                    // profile "Posts" reusing the story viewer UI) doesn't use the
                    // .media-photo class. Exclude header/avatar regions and require a
                    // meaningful share of the viewport so we never grab the small
                    // circular profile picture instead of the actual post image.
                    if (!imageSrc) {
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
                            const area = rect.width * rect.height;
                            return area > viewportArea * 0.15;
                        });
                        candidates.sort((a, b) => {
                            const ra = a.getBoundingClientRect();
                            const rb = b.getBoundingClientRect();
                            return (rb.width * rb.height) - (ra.width * ra.height);
                        });
                        if (candidates.length > 0) imageSrc = candidates[0].src;
                    }

                    if (imageSrc) {
                        window.__md_tel_download_image(imageSrc);
                    } else if (window.__md_tel_showToast) {
                        window.__md_tel_showToast("No se encontró la imagen para descargar", true);
                    }
                };
                return downloadButton;
            };

            const storyHeader = storiesContainer.querySelector("[class^='_ViewerStoryHeaderRight']");
            if (storyHeader && !storyHeader.querySelector(".tel-download")) {
                storyHeader.prepend(createDownloadButton());
            }
            const storyFooter = storiesContainer.querySelector("[class^='_ViewerStoryFooterRight']");
            if (storyFooter && !storyFooter.querySelector(".tel-download")) {
                storyFooter.prepend(createDownloadButton());
            }
        }

        // --- 2. MEDIA VIEWER (CHANNELS/CHATS) ---
        const mediaContainer = document.querySelector(".media-viewer-whole");
        if (!mediaContainer) return;
        const mediaAspecter = mediaContainer.querySelector(".media-viewer-movers .media-viewer-aspecter");
        const mediaButtons = mediaContainer.querySelector(".media-viewer-topbar .media-viewer-buttons");
        if (!mediaAspecter || !mediaButtons) return;

        // Check if there is a VISIBLE native download button
        let nativeBtn = null;
        const allNativeBtns = mediaButtons.querySelectorAll("button");
        for (const btn of allNativeBtns) {
            if (btn.classList.contains("tel-download")) continue;
            if (btn.title === "Download" || btn.classList.contains("tgico-download") || btn.textContent.includes(DOWNLOAD_ICON)) {
                if (!btn.classList.contains("hide") && getComputedStyle(btn).display !== "none") {
                    nativeBtn = btn;
                    break;
                }
            }
        }

        const video = mediaAspecter.querySelector("video");
        const img = mediaAspecter.querySelector("img.thumbnail") || mediaAspecter.querySelector("img");

        // If there IS a visible native button, don't inject a duplicate of ours —
        // but DO wire up our reliable download engine on top of the native button's
        // click, instead of fully trusting Telegram's own download mechanism (which,
        // per project notes, uses a plain `<a download>` that the browser silently
        // blocks for cross-origin images — this was leaving profile-post image
        // downloads doing nothing with no visible error).
        if (nativeBtn) {
            const existingOurBtn = mediaButtons.querySelector("button.tel-download");
            if (existingOurBtn) existingOurBtn.remove();

            if (!nativeBtn.__md_tel_wired) {
                nativeBtn.__md_tel_wired = true;
                nativeBtn.addEventListener("click", (e) => {
                    if (video) {
                        const videoSrc = video.currentSrc || video.src || video.querySelector("source")?.src;
                        if (videoSrc) {
                            e.preventDefault();
                            e.stopPropagation();
                            window.__md_tel_download_video(videoSrc);
                        }
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
            let downloadButton = mediaButtons.querySelector("button.tel-download");
            if (!downloadButton) {
                downloadButton = document.createElement("button");
                downloadButton.className = "btn-icon tgico-download tel-download";
                downloadButton.innerHTML = `<span class="tgico button-icon">${DOWNLOAD_ICON}</span>`;
                downloadButton.setAttribute("type", "button");
                downloadButton.setAttribute("title", "Download");
                mediaButtons.prepend(downloadButton);
            }
            return downloadButton;
        };

        if (video) {
            const btn = injectOurButton();
            btn.onclick = () => {
                const videoSrc = video.currentSrc || video.src || video.querySelector("source")?.src;
                if (videoSrc) window.__md_tel_download_video(videoSrc);
            };
        } else if (img && img.src) {
            const btn = injectOurButton();
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
                    // currentSrc reflects what the browser actually resolved/loaded,
                    // which is more reliable than a possibly-stale .src attribute.
                    const src = el.currentSrc || el.src || el.querySelector("source")?.src || "";
                    // Guard against an empty/placeholder src producing a bogus fetch("")
                    // (this previously caused a 302 redirect to the page itself).
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

                // Heuristic: if the image is being displayed much larger than its
                // natural (intrinsic) resolution, it's almost certainly an upscaled
                // thumbnail rather than the real asset — don't trust it blindly,
                // but it's still the best candidate we have at this point.
                return src;
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
