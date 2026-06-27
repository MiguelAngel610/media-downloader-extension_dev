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
                    } else {
                        // 2. Story with image
                        const imageSrc = storiesContainer.querySelector("img.media-photo")?.src;
                        if (imageSrc) window.__md_tel_download_image(imageSrc);
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
        let hasVisibleNativeButton = false;
        const allNativeBtns = mediaButtons.querySelectorAll("button");
        for (const btn of allNativeBtns) {
            if (btn.classList.contains("tel-download")) continue;
            if (btn.title === "Download" || btn.classList.contains("tgico-download") || btn.textContent.includes(DOWNLOAD_ICON)) {
                if (!btn.classList.contains("hide") && getComputedStyle(btn).display !== "none") {
                    hasVisibleNativeButton = true;
                    break;
                }
            }
        }

        // If there is a visible native button (Normal Channel), remove ours if it exists to avoid duplicates
        if (hasVisibleNativeButton) {
            const existingOurBtn = mediaButtons.querySelector("button.tel-download");
            if (existingOurBtn) existingOurBtn.remove();
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

        const video = mediaAspecter.querySelector("video");
        const img = mediaAspecter.querySelector("img.thumbnail") || mediaAspecter.querySelector("img");

        if (video) {
            const btn = injectOurButton();
            btn.onclick = () => {
                const videoSrc = video.src || video.currentSrc || video.querySelector("source")?.src;
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
            
            if (allMedia.length > 0) {
                // Sort by largest area (most likely the main media)
                allMedia.sort((a, b) => {
                    const rectA = a.getBoundingClientRect();
                    const rectB = b.getBoundingClientRect();
                    return (rectB.width * rectB.height) - (rectA.width * rectA.height);
                });
                
                const targetMedia = allMedia[0];
                const src = targetMedia.src || targetMedia.currentSrc || targetMedia.querySelector("source")?.src;
                
                if (src) {
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    
                    if (targetMedia.tagName === "VIDEO") {
                        window.__md_tel_download_video(src);
                    } else {
                        window.__md_tel_download_image(src);
                    }
                }
            }
        }
    }, true);
})();
