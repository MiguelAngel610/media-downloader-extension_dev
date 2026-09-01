// src/telegram/features/webk_buttons.js
(function() {
    let inited = false;
    window.__md_tel_initWebK = () => {
        if (inited) return;
        inited = true;
        setInterval(() => {
        const SVG_DOWNLOAD = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>`;
        const FORWARD_ICON = "\ue99a";

        /* Voice Message or Circle Video */
        const pinnedAudio = document.body.querySelector(".pinned-audio");
        let dataMid;
            let downloadButtonPinnedAudio = document.body.querySelector("._tel_download_button_pinned_container") || document.createElement("button");
            if (pinnedAudio) {
                dataMid = pinnedAudio.getAttribute("data-mid");
                downloadButtonPinnedAudio.className = "btn-icon tgico-download _tel_download_button_pinned_container";
                downloadButtonPinnedAudio.innerHTML = `<span class="tgico button-icon">${SVG_DOWNLOAD}</span>`;
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
                    const dateStr = window.__md_tel_extract_post_date(pinnedAudio);
                    const postId = window.__md_tel_extract_post_id(pinnedAudio);
                    const hint = dateStr ? dateStr : null;
                    if (isAudio) {
                        window.__md_tel_download_audio(link, hint, postId);
                    } else {
                        const videoEl = audioElement.querySelector("video");
                        if (videoEl) {
                            window.__md_tel_download_video_smart(videoEl, hint, postId);
                        } else {
                            window.__md_tel_download_video(link, hint, postId);
                        }
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
                downloadButton.innerHTML = `<span class="tgico" style="display:flex;align-items:center;justify-content:center;">${SVG_DOWNLOAD}</span><div class="c-ripple"></div>`;
                downloadButton.setAttribute("type", "button");
                downloadButton.setAttribute("title", "Download");
                downloadButton.setAttribute("aria-label", "Download");
                downloadButton.onclick = () => {
                    const dateStr = window.__md_tel_extract_post_date(storiesContainer);
                    const postId = window.__md_tel_extract_post_id(storiesContainer);
                    const hint = dateStr ? dateStr : null;

                    // 1. Story with video
                    const video = storiesContainer.querySelector("video.media-video");
                    if (video) {
                        window.__md_tel_download_video_smart(video, hint, postId);
                        return;
                    }

                    // 2. Story with image
                    const bestImg = window.__md_tel_find_best_image ? window.__md_tel_find_best_image(storiesContainer) : null;
                    const imageSrc = bestImg ? bestImg.src : storiesContainer.querySelector("img.media-photo, img:not(.thumbnail), img")?.src;

                    if (imageSrc) {
                        window.__md_tel_download_image(imageSrc, hint, postId);
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
            const title = btn.title || btn.getAttribute("aria-label") || "";
            if (title === "Download" || title === "Descargar" || btn.classList.contains("tgico-download") || btn.querySelector(".icon-download") || btn.classList.contains("quality-download-options-button-menu") || btn.innerHTML.includes("\uE983") || btn.innerHTML.includes("\uE955")) {
                if (!btn.classList.contains("hide") && getComputedStyle(btn).display !== "none") {
                    nativeBtn = btn;
                    break;
                }
            }
        }

        const video = mediaAspecter.querySelector("video");
        const bestImgInit = window.__md_tel_find_best_image ? window.__md_tel_find_best_image(mediaAspecter) : null;
        const img = bestImgInit || mediaAspecter.querySelector("img:not(.thumbnail)") || mediaAspecter.querySelector("img");

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
                
                const interceptor = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    
                    if (e.type !== "click") return;

                    const getActiveContainer = (fallback) => Array.from(document.querySelectorAll(".media-viewer-whole, #stories-viewer, #MediaViewer")).find(el => window.getComputedStyle(el).display !== "none" && parseFloat(window.getComputedStyle(el).opacity || "1") > 0.01) || fallback;
                const activeContainer = getActiveContainer(mediaContainer);
                    const dateStr = window.__md_tel_extract_post_date(activeContainer);
                    const postId = window.__md_tel_extract_post_id(activeContainer);
                    const hint = dateStr ? dateStr : null;

                    const bestVideo = window.__md_tel_find_best_video ? window.__md_tel_find_best_video(activeContainer || mediaAspecter) : null;
                    const currentVideo = bestVideo || activeContainer.querySelector("video") || mediaAspecter.querySelector("video");
                    const currentBestImg = window.__md_tel_find_best_image ? window.__md_tel_find_best_image(activeContainer || mediaAspecter) : null;
                    const currentImg = currentBestImg || mediaAspecter.querySelector("img:not(.thumbnail)") || mediaAspecter.querySelector("img");

                    if (currentVideo) {
                        window.__md_tel_download_video_smart(currentVideo, hint, postId);
                    } else if (currentImg && currentImg.src) {
                        window.__md_tel_download_image(currentImg.src, hint, postId);
                    } else if (window.__md_tel_showToast) {
                        window.__md_tel_showToast("No se encontró el archivo a descargar", true);
                    }
                };

                ["click", "mousedown", "pointerdown"].forEach(evt => {
                    nativeBtn.addEventListener(evt, interceptor, true);
                });
            }
            return;
        }

        // If no visible native button (Restricted Channel), inject ours
        const injectOurButton = () => {
            let downloadButton = mediaButtons.querySelector("button.tel-download");
            if (!downloadButton) {
                downloadButton = document.createElement("button");
                downloadButton.className = "btn-icon tgico-download tel-download";
                downloadButton.innerHTML = `<span class="tgico button-icon">${SVG_DOWNLOAD}</span>`;
                downloadButton.setAttribute("type", "button");
                downloadButton.setAttribute("title", "Download");
                mediaButtons.prepend(downloadButton);
            }
            return downloadButton;
        };

        const dateStr = window.__md_tel_extract_post_date(mediaContainer);
        const postId = window.__md_tel_extract_post_id(mediaContainer);
        const hint = dateStr ? dateStr : null;

        if (video) {
            const btn = injectOurButton();
            btn.onclick = () => {
                const getActiveContainer = (fallback) => Array.from(document.querySelectorAll(".media-viewer-whole, #stories-viewer, #MediaViewer")).find(el => window.getComputedStyle(el).display !== "none" && parseFloat(window.getComputedStyle(el).opacity || "1") > 0.01) || fallback;
                const activeContainer = getActiveContainer(mediaContainer);
                const curDateStr = window.__md_tel_extract_post_date(activeContainer);
                const curPostId = window.__md_tel_extract_post_id(activeContainer);
                window.__md_tel_download_video_smart(video, curDateStr || null, curPostId);
            };
        } else if (img && img.src) {
            const btn = injectOurButton();
            btn.onclick = () => {
                const getActiveContainer = (fallback) => Array.from(document.querySelectorAll(".media-viewer-whole, #stories-viewer, #MediaViewer")).find(el => window.getComputedStyle(el).display !== "none" && parseFloat(window.getComputedStyle(el).opacity || "1") > 0.01) || fallback;
                const activeContainer = getActiveContainer(mediaContainer);
                const curDateStr = window.__md_tel_extract_post_date(activeContainer);
                const curPostId = window.__md_tel_extract_post_id(activeContainer);
                const activeBestImg = window.__md_tel_find_best_image ? window.__md_tel_find_best_image(activeContainer) : null;
                window.__md_tel_download_image(activeBestImg ? activeBestImg.src : img.src, curDateStr || null, curPostId);
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
            // (the full-resolution file is normally only fetched once the native
            // media viewer opens, which this interceptor intentionally bypasses).
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
            const dateStr = window.__md_tel_extract_post_date(msgContainer);
            const postId = window.__md_tel_extract_post_id(msgContainer);
            const hint = dateStr ? dateStr : null;

            if (src) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();

                if (targetMedia.tagName.toLowerCase() === "video") {
                    const bestVideo = window.__md_tel_find_best_video ? window.__md_tel_find_best_video(targetMedia) : null;
                    window.__md_tel_download_video_smart(bestVideo || targetMedia, hint, postId);
                } else {
                    const bestImg = window.__md_tel_find_best_image ? window.__md_tel_find_best_image(targetMedia) : null;
                    window.__md_tel_download_image(bestImg ? bestImg.src : src, hint, postId);
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
