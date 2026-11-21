// src/telegram/main.js
(function() {
    console.log("[Media Downloader] Initializing Telegram Downloader...");

    const REFRESH_DELAY = 500;

    const pollCallback = () => {
        // Initialize both flavors safely (they now have built-in inited guards against interval replication)
        if (window.__md_tel_initWebZ && (document.getElementById("StoryViewer") || document.querySelector("#MediaViewer") || location.host === "webz.telegram.org" || location.pathname.startsWith("/z/"))) {
            window.__md_tel_initWebZ();
        }
        if (window.__md_tel_initWebK && (document.getElementById("stories-viewer") || document.querySelector(".media-viewer-whole") || document.querySelector(".pinned-audio") || document.querySelector("audio-element") || location.host === "webk.telegram.org" || location.pathname.startsWith("/k/"))) {
            window.__md_tel_initWebK();
        }
    };

    if (window.MDObserverManager) {
        window.MDObserverManager.pollDOM(pollCallback, REFRESH_DELAY);
    } else {
        setInterval(pollCallback, REFRESH_DELAY);
    }

    // Global Intelligent Keyboard Shortcut for Telegram
    if (window.ShortcutManager) {
        window.ShortcutManager.onShortcutPressed(() => {
            const isTrulyVisible = (el) => {
                if (!el || !document.body.contains(el)) return false;
                const style = window.getComputedStyle(el);
                if (style.display === "none" || style.visibility === "hidden" || parseFloat(style.opacity) <= 0.01 || style.pointerEvents === "none") {
                    return false;
                }
                const r = el.getBoundingClientRect();
                if (r.width === 0 || r.height === 0) return false;
                if (r.bottom < -50 || r.top > window.innerHeight + 50 || r.right < -50 || r.left > window.innerWidth + 50) {
                    return false;
                }
                // Check parent chain up to body to filter out closed/hidden viewers, dialogs or profile overlays
                let parent = el.parentElement;
                while (parent && parent !== document.body) {
                    const pStyle = window.getComputedStyle(parent);
                    if (pStyle.display === "none" || pStyle.visibility === "hidden" || parseFloat(pStyle.opacity) <= 0.01) {
                        return false;
                    }
                    parent = parent.parentElement;
                }
                return true;
            };

            const getDownloadButtons = (container = document) => {
                let rawBtns = Array.from(container.querySelectorAll(".tel-download, .tgico-download, [title='Download'], [title='Descargar'], [aria-label='Download'], [aria-label='Descargar'], .quality-download-options-button-menu, button[class*='download'], button[class*='Download'], .icon-download"));
                let btns = rawBtns.map(b => (b.tagName !== "BUTTON" && b.tagName !== "A" && b.closest("button, a, [role='button']")) || b);
                
                // Also scan visible buttons for WebK Unicode download icons (\uE983, \uE955)
                let allIconButtons = Array.from(container.querySelectorAll("button, [role='button']")).filter(b => {
                    const html = b.innerHTML || "";
                    return html.includes("\uE983") || html.includes("\uE955");
                });
                btns = Array.from(new Set([...btns, ...allIconButtons]));
                return btns.filter(b => isTrulyVisible(b) && !b.classList.contains("hide") && !b.disabled);
            };

            // 1. Stories Viewer Mode (Search all possible story modals that are truly visible)
            const activeStoryViewers = Array.from(document.querySelectorAll("#StoryViewer, #stories-viewer, .StoryViewer, .stories-viewer")).filter(isTrulyVisible);
            for (let viewer of activeStoryViewers) {
                let storyBtns = getDownloadButtons(viewer);
                if (storyBtns.length > 0) {
                    let custom = storyBtns.find(b => b.classList.contains("tel-download"));
                    (custom || storyBtns[0]).click();
                    return;
                }
            }

            // 2. Explicit Media Viewer Modal Mode (Photos & Videos inside Profiles/Chats opened in fullscreen overlay)
            // Reverse DOM order so the most recently opened/innermost active viewer is processed first
            const activeMediaViewers = Array.from(document.querySelectorAll("#MediaViewer, .media-viewer-whole, .MediaViewer, .media-viewer, .shared-media-viewer, .Gallery")).filter(isTrulyVisible).reverse();
            for (let viewer of activeMediaViewers) {
                let viewerBtns = getDownloadButtons(viewer);
                if (viewerBtns.length > 0) {
                    let custom = viewerBtns.find(b => b.classList.contains("tel-download"));
                    (custom || viewerBtns[0]).click();
                    return;
                } else {
                    // Fallback: Viewer is active but has no buttons (e.g. Profile posts without native buttons)
                    const video = viewer.querySelector("video");
                    const dateStr = window.__md_tel_extract_post_date ? window.__md_tel_extract_post_date(viewer) : null;
                    const postId = window.__md_tel_extract_post_id ? window.__md_tel_extract_post_id(viewer) : null;
                    
                    if (video) {
                        if (window.__md_tel_download_video_smart) window.__md_tel_download_video_smart(video, dateStr, postId);
                        return;
                    }
                    const bestImg = window.__md_tel_find_best_image ? window.__md_tel_find_best_image(viewer) : null;
                    const imageSrc = bestImg ? bestImg.src : viewer.querySelector("img:not(.thumbnail), img")?.src;
                    if (imageSrc && window.__md_tel_download_image) {
                        window.__md_tel_download_image(imageSrc, dateStr, postId);
                        return;
                    }
                }
            }

            // 3. General Dialogs & Overlays Mode (Profile drawers, info modals, etc. that aren't fullscreen media viewers)
            const activeDialogs = Array.from(document.querySelectorAll("[role='dialog'], .dialog, .modal-container, .popup-container")).filter(isTrulyVisible).reverse();
            for (let dlg of activeDialogs) {
                let dlgBtns = getDownloadButtons(dlg);
                if (dlgBtns.length > 0) {
                    let custom = dlgBtns.find(b => b.classList.contains("tel-download"));
                    (custom || dlgBtns[0]).click();
                    return;
                } else {
                    // Fallback for dialogs
                    const video = dlg.querySelector("video");
                    const dateStr = window.__md_tel_extract_post_date ? window.__md_tel_extract_post_date(dlg) : null;
                    const postId = window.__md_tel_extract_post_id ? window.__md_tel_extract_post_id(dlg) : null;
                    
                    if (video) {
                        if (window.__md_tel_download_video_smart) window.__md_tel_download_video_smart(video, dateStr, postId);
                        return;
                    }
                    const bestImg = window.__md_tel_find_best_image ? window.__md_tel_find_best_image(dlg) : null;
                    const imageSrc = bestImg ? bestImg.src : dlg.querySelector("img:not(.thumbnail), img")?.src;
                    if (imageSrc && window.__md_tel_download_image) {
                        window.__md_tel_download_image(imageSrc, dateStr, postId);
                        return;
                    }
                }
            }

            // 4. Feed / Chat / Profile Viewport (click closest download button to vertical center of viewport)
            let allVisibleBtns = getDownloadButtons(document);
            if (allVisibleBtns.length > 0) {
                // 4a. Check if the mouse is hovering over a specific message/media container
                let hoveredElements = [];
                try { hoveredElements = Array.from(document.querySelectorAll(':hover')); } catch (err) { window.MDErrorReporter.reportError('TG: hover lookup', err); }
                let hoveredContainer = hoveredElements.reverse().find(el => el.closest && el.closest('.Message, .message, .Album, .media-photo, .media-video, .bubble, .SharedMediaItem, .media-grid-item, .Profile-media, .Avatar, .avatar-viewer'));
                
                if (hoveredContainer) {
                    let target = hoveredContainer.closest('.Message, .message, .Album, .media-photo, .media-video, .bubble, .SharedMediaItem, .media-grid-item, .Profile-media, .Avatar, .avatar-viewer');
                    let containerBtns = getDownloadButtons(target);
                    if (containerBtns.length > 0) {
                        let custom = containerBtns.find(b => b.classList.contains("tel-download"));
                        (custom || containerBtns[0]).click();
                        return;
                    } else {
                        // Profile grid thumbnails usually don't have download buttons in the DOM.
                        // Force download directly from the media source:
                        const video = target.querySelector("video");
                        const dateStr = window.__md_tel_extract_post_date ? window.__md_tel_extract_post_date(target) : null;
                        const postId = window.__md_tel_extract_post_id ? window.__md_tel_extract_post_id(target) : null;
                        
                        if (video) {
                            if (window.__md_tel_download_video_smart) window.__md_tel_download_video_smart(video, dateStr, postId);
                            return;
                        }
                        const bestImg = window.__md_tel_find_best_image ? window.__md_tel_find_best_image(target) : null;
                        const imageSrc = bestImg ? bestImg.src : target.querySelector("img")?.src;
                        if (imageSrc && window.__md_tel_download_image) {
                            window.__md_tel_download_image(imageSrc, dateStr, postId);
                            return;
                        }
                    }
                }

                // 4b. Fallback: closest to vertical center, prioritizing RightColumn (Profile) if it's open and has buttons
                const rightColumnBtns = allVisibleBtns.filter(b => b.closest && b.closest('.RightColumn, .Profile, .chat-info, .sidebar'));
                let targetBtns = rightColumnBtns.length > 0 ? rightColumnBtns : allVisibleBtns;

                targetBtns.sort((a, b) => {
                    let aR = a.getBoundingClientRect(), bR = b.getBoundingClientRect();
                    let distA = Math.abs(aR.top + aR.height/2 - window.innerHeight/2);
                    let distB = Math.abs(bR.top + bR.height/2 - window.innerHeight/2);
                    // If vertical distance difference is small (< 40px, on same message/line), prefer custom button
                    if (Math.abs(distA - distB) < 40) {
                        const aCustom = a.classList.contains("tel-download") ? 1 : 0;
                        const bCustom = b.classList.contains("tel-download") ? 1 : 0;
                        if (aCustom !== bCustom) return bCustom - aCustom;
                    }
                    return distA - distB;
                });
                targetBtns[0].click();
                return;
            }

            // 5. Final fallback: No button or viewer found
            if (window.__md_tel_showToast) {
                window.__md_tel_showToast("Shortcut: No download button or media viewer found", true);
            }
        });
    }

    console.log("[Media Downloader] Telegram Downloader running.");
})();
