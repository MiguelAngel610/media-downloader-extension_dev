/* Media Downloader for Facebook - Theater (Profile/Post) Modals */

const FB_THEATER_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:20px;height:20px"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;

function injectTheaterButtons() {
    // Facebook Theater Modals usually have role="dialog" or are just full-screen containers
    const dialogs = Array.from(document.querySelectorAll('[role="dialog"], [data-visualcompletion="ignore-dynamic"]'));
    
    for (let dialog of dialogs) {
        // Look for typical Theater toolbar buttons
        const closeBtn = dialog.querySelector('div[aria-label="Close"], div[aria-label="Cerrar"]');
        const zoomBtn = dialog.querySelector('div[aria-label="Zoom in"], div[aria-label="Acercar"]');
        const fullscreenBtn = dialog.querySelector('div[aria-label="Enter fullscreen"], div[aria-label="Pantalla completa"]');
        
        let targetToolbar = null;
        if (closeBtn) targetToolbar = closeBtn.parentElement;
        else if (zoomBtn) targetToolbar = zoomBtn.parentElement;
        else if (fullscreenBtn) targetToolbar = fullscreenBtn.parentElement;

        if (!targetToolbar) continue;

        // Ensure we haven't already injected
        if (targetToolbar.querySelector('.md-fb-download')) continue;

        const video = dialog.querySelector('video');
        const hasVideo = !!video;

        const wrapper = document.createElement("div");
        wrapper.className = "md-fb-download";
        wrapper.setAttribute("role", "button");
        wrapper.setAttribute("tabindex", "0");
        wrapper.setAttribute("aria-label", "Download");
        // Styling matches FB theater icons
        wrapper.style.cssText = "cursor:pointer;display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,0.1);transition:background-color 0.2s;flex-shrink:0;margin-right:8px;";
        wrapper.innerHTML = FB_THEATER_SVG;

        wrapper.addEventListener("mouseenter", () => { wrapper.style.backgroundColor = "rgba(255,255,255,0.2)"; });
        wrapper.addEventListener("mouseleave", () => { wrapper.style.backgroundColor = "rgba(255,255,255,0.1)"; });

        wrapper.addEventListener("mousedown", (e) => e.stopPropagation());
        wrapper.addEventListener("mouseup", (e) => e.stopPropagation());

        wrapper.addEventListener("click", async (e) => {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            
            let metadata = { 
                username: "fb_user", 
                shortcode: "post", 
                timestamp: Math.floor(Date.now() / 1000),
                story_url: window.location.href
            };
            
            if (window.FBMetadataParser) {
                let extracted = window.FBMetadataParser.extractFromDOM(dialog);
                metadata.username = extracted.username || metadata.username;
                metadata.timestamp = extracted.timestamp || metadata.timestamp;
                if (extracted.shortcode && extracted.shortcode !== "story") {
                    metadata.shortcode = extracted.shortcode;
                }
            }

            if (hasVideo) {
                window.postMessage({ action: "FB_GET_STORY_VIDEO", metadata: metadata }, "*");
            } else {
                // For theater images, FB uses high-res images inside the dialog. 
                // We'll let the interceptor grab the largest image.
                window.postMessage({ action: "FB_GET_STORY_IMAGE", metadata: metadata }, "*");
            }
        });

        // Insert at the beginning of the toolbar
        targetToolbar.insertBefore(wrapper, targetToolbar.firstChild);
        console.log("[FB-MD] OK: inserted in Theater modal");
    }
}
