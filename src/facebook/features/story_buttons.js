/* Media Downloader for Facebook - Story download button injection */

// Clean download arrow SVG matching FB's icon stroke style

function injectStoryButtons() {
    const allBtns = document.querySelectorAll('[role="button"], div[role="button"]');

    let playBtnWrapper = null;
    let targetBtn = null;
    let grandParent = null;

    for (const btn of allBtns) {
        const label = (btn.getAttribute("aria-label") || "");
        if (label === "Play" || label === "Pause" || label === "Unmute" || label === "Mute" ||
            label === "Reactivar" || label === "Reproducir" || label === "Pausar" || label === "Silenciar") {
            targetBtn = btn;
            playBtnWrapper = btn.parentElement;
            grandParent = playBtnWrapper ? playBtnWrapper.parentElement : null;
            break;
        }
    }

    if (!targetBtn || !playBtnWrapper || !grandParent) return;

    // Fix duplicate check! DO NOT remove the old button, just return if it exists to avoid infinite loops
    if (document.querySelector(".md-fb-download")) return;

    // Try to find the global header's right-side navigation container (where Messenger/Menu live)
    let headerNav = null;
    let banner = document.querySelector('[role="banner"]');
    if (banner) {
        let menuBtn = banner.querySelector('a[aria-label="Messenger"], svg[aria-label="Messenger"]');
        if (menuBtn) {
            let current = menuBtn;
            for (let i = 0; i < 7; i++) {
                if (current && current.parentElement) {
                    current = current.parentElement;
                    if (current.children.length >= 3) {
                        headerNav = current;
                        break;
                    }
                }
            }
        }
    }

    // Build a clean, native-looking button matching the "white circles"
    const mdWrapper = document.createElement("div");
    mdWrapper.className = "md-fb-download";

    if (headerNav) {
        // Native integration styling: apply a strict 8px right margin to separate from the adjacent 9-dots menu
        mdWrapper.style.cssText = "display: flex; align-items: center; justify-content: center; width: 40px; height: 40px; border-radius: 50%; background: #E4E6EB; cursor: pointer; transition: background-color 0.2s; margin: 0 8px 0 0; flex-shrink: 0; z-index: 9999;";
        mdWrapper.innerHTML = `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:20px;height:20px"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;

        mdWrapper.addEventListener("mouseenter", () => { mdWrapper.style.background = "#D8DADF"; });
        mdWrapper.addEventListener("mouseleave", () => { mdWrapper.style.background = "#E4E6EB"; });
    } else {
        // Fallback: floating but positioned horizontally to align with where the header usually is
        mdWrapper.style.cssText = "position: fixed !important; top: 8px; right: 280px; z-index: 999999; display: flex; align-items: center; justify-content: center; width: 40px; height: 40px; border-radius: 50%; background: #E4E6EB; cursor: pointer; transition: background-color 0.2s; box-shadow: 0 2px 4px rgba(0,0,0,0.2);";
        mdWrapper.innerHTML = `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:20px;height:20px"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;

        mdWrapper.addEventListener("mouseenter", () => { mdWrapper.style.background = "#D8DADF"; });
        mdWrapper.addEventListener("mouseleave", () => { mdWrapper.style.background = "#E4E6EB"; });
    }

    // Prevent propagation
    mdWrapper.addEventListener("mousedown", (e) => { e.stopPropagation(); });
    mdWrapper.addEventListener("mouseup", (e) => { e.stopPropagation(); });

    mdWrapper.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        let storyUrl = window.location.href;
        let match = storyUrl.match(/\/(?:stories|reel)\/[^\/]+\/([^\/\?]+)/) || storyUrl.match(/\/(?:stories|reel)\/([^\/\?]+)/);
        let storyId = match ? match[1] : null;

        // Fix duplicated IDs in URL (e.g. 1234_1234)
        if (storyId) {
            storyId = storyId.split('?')[0].split('&')[0].split('/')[0];
            if (storyId.includes('_')) {
                storyId = storyId.split('_').pop();
            }
        }

        let metadata = {
            username: "fb_user",
            shortcode: storyId || "story_" + Math.floor(Date.now() / 1000),
            timestamp: Math.floor(Date.now() / 1000),
            story_url: storyUrl,
            mediaType: "video" // Will be updated by interceptor
        };

        if (window.FBMetadataParser) {
            let extracted = window.FBMetadataParser.extractFromDOM(document.body);
            metadata.username = extracted.username || metadata.username;
            metadata.timestamp = extracted.timestamp || metadata.timestamp;
            if (extracted.shortcode && extracted.shortcode !== "story" && !storyId) {
                metadata.shortcode = extracted.shortcode;
            }
        }

        // Direct DOM Fallback for Username from the Story Header
        if (metadata.username === "fb_user" || metadata.username === "facebook.menu") {
            try {
                // The story author link is usually within the same major container as the play button
                let container = targetBtn.closest('div[data-pagelet]') || document.body;
                let authorLinks = container.querySelectorAll('a[role="link"][tabindex="0"]');
                for (let link of authorLinks) {
                    if (link.href && link.href.includes('facebook.com') && !link.href.includes('stories')) {
                        let parts = new URL(link.href).pathname.split('/');
                        let potentialName = parts[1]; // pathname starts with / so index 1 is the first path segment
                        if (potentialName && !['messages', 'groups', 'events', 'watch', 'gaming', 'marketplace', 'bookmarks', 'menu', 'pages', 'friends', 'photo'].includes(potentialName.toLowerCase())) {
                            if (!/^\d+$/.test(potentialName)) {
                                metadata.username = potentialName;
                                break;
                            }
                        }
                    }
                }
            } catch (e) {}
        }

        if (window.MDToastManager) window.MDToastManager.showInfo("🔍 Scanning Facebook state for media...");
        console.log("[FB-MD] Requesting story media from interceptor for:", storyId);
        window.postMessage({ action: "FB_GET_STORY_MEDIA", metadata: metadata }, "*");
    });

    if (headerNav) {
        // Prepend it perfectly adjacent to the 9-dots menu to avoid justify-content gaps
        let menuBtn = headerNav.querySelector('svg[aria-label="Menu"], svg[aria-label="Menú"]');
        if (menuBtn) {
            let container = menuBtn.closest('li, div[role="button"]') || menuBtn.parentNode;
            if (container && container.parentNode === headerNav) {
                headerNav.insertBefore(mdWrapper, container);
            } else {
                headerNav.insertBefore(mdWrapper, headerNav.firstChild);
            }
        } else {
            headerNav.insertBefore(mdWrapper, headerNav.firstChild);
        }
        console.log("[FB-MD] OK: inserted native button in global header");
    } else {
        document.body.appendChild(mdWrapper);
        console.log("[FB-MD] OK: inserted floating fallback button");
    }

    // Cleanup logic: remove button if the story is closed
    const observer = new MutationObserver(() => {
        if (!document.body.contains(targetBtn)) {
            mdWrapper.remove();
            observer.disconnect();
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });
}
