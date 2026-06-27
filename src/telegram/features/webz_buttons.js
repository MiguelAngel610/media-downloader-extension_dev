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
                    } else {
                        const images = storiesContainer.querySelectorAll("img.PVZ8TOWS");
                        if (images.length > 0) {
                            const imageSrc = images[images.length - 1]?.src;
                            if (imageSrc) window.__md_tel_download_image(imageSrc);
                        }
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
        let hasVisibleNativeButton = false;
        const allNativeBtns = mediaViewerActions.querySelectorAll("button");
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
            const existingOurBtn = mediaViewerActions.querySelector("button.tel-download");
            if (existingOurBtn) existingOurBtn.remove();
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

        const videoPlayer = mediaContainer.querySelector(".MediaViewerContent > .VideoPlayer");
        const img = mediaContainer.querySelector("img");
        
        if (videoPlayer) {
            const videoUrl = videoPlayer.querySelector("video")?.currentSrc || videoPlayer.querySelector("video")?.src;
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
