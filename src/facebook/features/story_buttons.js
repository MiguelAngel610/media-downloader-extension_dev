/* Media Downloader for Facebook - Story download button injection */

// Clean download arrow SVG matching FB's icon stroke style
const FB_DOWNLOAD_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;

function injectStoryButtons() {
    // Instead of strictly relying on [role="dialog"], look for the media controls
    const allBtns = document.querySelectorAll('[role="button"], div[role="button"]');
    
    let playBtn = null;
    let toolbar = null;
    let storyContainer = null;

    for (const btn of allBtns) {
        const label = (btn.getAttribute("aria-label") || "");
        if (label === "Play" || label === "Pause" || label === "Unmute" || label === "Mute" ||
            label === "Reactivar" || label === "Reproducir" || label === "Pausar" || label === "Silenciar") {
            
            // Found a control button, its parent is likely the toolbar
            toolbar = btn.parentElement;
            
            // Search up to find the container holding the video/image
            let parent = toolbar;
            while (parent && parent !== document.body) {
                // FB uses many nested divs. The closest one with a video or large image is our container.
                if (parent.querySelector("video") || Array.from(parent.querySelectorAll("img")).some(i => i.naturalWidth > 100)) {
                    storyContainer = parent;
                    break;
                }
                parent = parent.parentElement;
            }
            if (storyContainer) {
                playBtn = btn;
                break;
            }
        }
    }

    if (!toolbar || !storyContainer) {
        return; 
    }

    // Remove old button if it exists
    const oldBtn = toolbar.querySelector(".md-fb-download");
    if (oldBtn) return; // Already injected

    const video = storyContainer.querySelector("video");
    const hasVideo = !!video;

    const wrapper = createDownloadBtn(hasVideo, storyContainer);

    // Insert as first child of the toolbar (leftmost position)
    toolbar.insertBefore(wrapper, toolbar.firstChild);
    console.log("[FB-MD] OK: inserted in toolbar");
}

function createDownloadBtn(hasVideo, storyDialog) {
    const wrapper = document.createElement("div");
    wrapper.className = "md-fb-download";
    wrapper.setAttribute("role", "button");
    wrapper.setAttribute("tabindex", "0");
    wrapper.setAttribute("aria-label", "Download");
    // Match FB's story button styling: circular, white icons, subtle hover
    wrapper.style.cssText = "cursor:pointer;display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:50%;background:transparent;transition:background-color 0.2s;flex-shrink:0;";
    wrapper.innerHTML = FB_DOWNLOAD_SVG;

    wrapper.addEventListener("mouseenter", () => { wrapper.style.backgroundColor = "rgba(255,255,255,0.15)"; });
    wrapper.addEventListener("mouseleave", () => { wrapper.style.backgroundColor = "transparent"; });

    // Prevent parent click handlers from capturing our clicks
    wrapper.addEventListener("mousedown", (e) => { e.stopPropagation(); });
    wrapper.addEventListener("mouseup", (e) => { e.stopPropagation(); });

    wrapper.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        
        let metadata = { username: "fb_user", shortcode: "story", timestamp: Math.floor(Date.now() / 1000) };
        if (window.FBMetadataParser) {
            metadata = window.FBMetadataParser.extractFromDOM(storyDialog);
        } else {
            console.error("[FB-MD] FBMetadataParser not found!");
        }

        if (hasVideo) {
            window.postMessage({ action: "FB_GET_STORY_VIDEO", metadata: metadata }, "*");
        } else {
            window.postMessage({ action: "FB_GET_STORY_IMAGE", metadata: metadata }, "*");
        }
    });

    return wrapper;
}
