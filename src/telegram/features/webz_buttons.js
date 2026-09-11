// src/telegram/features/webz_buttons.js
(function() {
    let inited = false;
    window.__md_tel_initWebZ = () => {
        if (inited) return;
        inited = true;
        // For webz /a/ webapp
    setInterval(() => {
        const SVG_DOWNLOAD = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>`;

        // --- 1. STORIES ---
        const storiesContainer = document.getElementById("StoryViewer");
        if (storiesContainer) {
            const createDownloadButton = () => {
                const downloadIcon = document.createElement("i");
                downloadIcon.className = "icon";
                downloadIcon.innerHTML = SVG_DOWNLOAD;
                const downloadButton = document.createElement("button");
                downloadButton.className = "Button TkphaPyQ tiny translucent-white round tel-download";
                downloadButton.appendChild(downloadIcon);
                downloadButton.setAttribute("type", "button");
                downloadButton.setAttribute("title", "Download");
                downloadButton.setAttribute("aria-label", "Download");
                downloadButton.onclick = () => {
                    const video = storiesContainer.querySelector("video");
                    const dateStr = window.__md_tel_extract_post_date(storiesContainer);
                    const postId = window.__md_tel_extract_post_id(storiesContainer);
                    const hint = dateStr ? dateStr : null;
                    if (video) {
                        window.__md_tel_download_video_smart(video, hint, postId);
                        return;
                    }

                    const bestImg = window.__md_tel_find_best_image ? window.__md_tel_find_best_image(storiesContainer) : null;
                    const imageSrc = bestImg ? bestImg.src : storiesContainer.querySelector("img:not(.thumbnail), img")?.src;

                    if (imageSrc) {
                        window.__md_tel_download_image(imageSrc, hint, postId);
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
            const title = btn.title || btn.getAttribute("aria-label") || "";
            if (title === "Download" || title === "Descargar" || btn.classList.contains("tgico-download") || btn.querySelector(".icon-download")) {
                if (!btn.classList.contains("hide") && getComputedStyle(btn).display !== "none") {
                    nativeBtn = btn;
                    break;
                }
            }
        }

        const videoPlayer = mediaContainer.querySelector(".MediaViewerContent > .VideoPlayer");
        const bestImgInit = window.__md_tel_find_best_image ? window.__md_tel_find_best_image(mediaContainer) : null;
        const img = bestImgInit || mediaContainer.querySelector("img:not(.thumbnail)") || mediaContainer.querySelector("img");
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
                
                const interceptor = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    
                    if (e.type !== "click") return;

                    const getActiveContainer = (fallback) => Array.from(document.querySelectorAll("#MediaViewer")).find(el => window.getComputedStyle(el).display !== "none" && parseFloat(window.getComputedStyle(el).opacity || "1") > 0.01) || fallback;
                    const activeContainer = getActiveContainer(mediaContainer);
                    const dateStr = window.__md_tel_extract_post_date(activeContainer);
                    const postId = window.__md_tel_extract_post_id(activeContainer);
                    const hint = dateStr ? dateStr : null;

                    const bestVideo = window.__md_tel_find_best_video ? window.__md_tel_find_best_video(activeContainer || mediaContainer) : null;
                    const currentVideoPlayer = bestVideo || activeContainer.querySelector(".MediaViewerContent > .VideoPlayer, video") || mediaContainer.querySelector("video");
                    const currentBestImg = window.__md_tel_find_best_image ? window.__md_tel_find_best_image(activeContainer || mediaContainer) : null;
                    const currentImg = currentBestImg || activeContainer.querySelector("img:not(.thumbnail)") || activeContainer.querySelector("img");

                    if (currentVideoPlayer && (currentVideoPlayer.tagName === "VIDEO" || currentVideoPlayer.querySelector("video"))) {
                        const vidEl = currentVideoPlayer.tagName === "VIDEO" ? currentVideoPlayer : currentVideoPlayer.querySelector("video");
                        window.__md_tel_download_video_smart(vidEl, hint, postId);
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
            return; // Don't inject our custom button if we intercepted the native one
        }

        // If no visible native button (Restricted Channel), inject ours
        const injectOurButton = () => {
            let downloadButton = mediaViewerActions.querySelector("button.tel-download");
            if (!downloadButton) {
                const downloadIcon = document.createElement("i");
                downloadIcon.className = "icon";
                downloadIcon.innerHTML = SVG_DOWNLOAD;
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

        if (videoPlayer && videoPlayer.querySelector("video")) {
            const video = videoPlayer.querySelector("video");
            const btn = injectOurButton();
            btn.setAttribute("data-tel-download-url", videoUrl);
            btn.onclick = () => {
                const getActiveContainer = (fallback) => Array.from(document.querySelectorAll("#MediaViewer")).find(el => window.getComputedStyle(el).display !== "none" && parseFloat(window.getComputedStyle(el).opacity || "1") > 0.01) || fallback;
                const activeContainer = getActiveContainer(mediaContainer);
                const curDateStr = window.__md_tel_extract_post_date(activeContainer);
                const curPostId = window.__md_tel_extract_post_id(activeContainer);
                window.__md_tel_download_video_smart(video, curDateStr || null, curPostId);
            };
        } else if (img && img.src) {
            const btn = injectOurButton();
            btn.setAttribute("data-tel-download-url", img.src);
            btn.onclick = () => {
                const getActiveContainer = (fallback) => Array.from(document.querySelectorAll("#MediaViewer")).find(el => window.getComputedStyle(el).display !== "none" && parseFloat(window.getComputedStyle(el).opacity || "1") > 0.01) || fallback;
                const activeContainer = getActiveContainer(mediaContainer);
                const curDateStr = window.__md_tel_extract_post_date(activeContainer);
                const curPostId = window.__md_tel_extract_post_id(activeContainer);
                const activeBestImg = window.__md_tel_find_best_image ? window.__md_tel_find_best_image(activeContainer) : null;
                window.__md_tel_download_image(activeBestImg ? activeBestImg.src : img.src, curDateStr || null, curPostId);
            };
        }
    }, 500);
    };
    
})();
