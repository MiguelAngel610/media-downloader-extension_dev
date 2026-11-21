/* Media Downloader - PFP Button: Profile picture download button */

function injectPfpButton() {
    let overlayRoot = getOverlayRoot();
    let profilePic = document.querySelector('header img[alt*="profile picture"], header img[alt*="foto de perfil"]');
    if (profilePic && !profilePic.__md_processed) {
        profilePic.__md_processed = true;
        let id = 'md-pfp-dl';
        profilePic.dataset.mdId = id;

        // (Invisible tab logic removed as we now use the native background API)

        let dlBtn = document.createElement('button');
        dlBtn.id = id;
        dlBtn.className = 'md-pfp-btn';
        dlBtn.innerHTML = SVG_DOWNLOAD;
        dlBtn.title = "Download Profile Picture";

        // --- Rediseño Premium (Efecto Glassmorphism/Cristal) ---
        dlBtn.style.position = 'absolute';
        dlBtn.style.pointerEvents = 'auto';
        dlBtn.style.background = 'rgba(255, 255, 255, 0.2)';
        dlBtn.style.backdropFilter = 'blur(12px)';
        dlBtn.style.WebkitBackdropFilter = 'blur(12px)';
        dlBtn.style.borderRadius = '50%';
        dlBtn.style.width = '34px';
        dlBtn.style.height = '34px';
        dlBtn.style.display = 'flex';
        dlBtn.style.alignItems = 'center';
        dlBtn.style.justifyContent = 'center';
        dlBtn.style.color = '#fff';
        dlBtn.style.border = '1px solid rgba(255, 255, 255, 0.4)';
        dlBtn.style.boxShadow = '0 4px 15px rgba(0, 0, 0, 0.25)';
        dlBtn.style.cursor = 'pointer';
        dlBtn.style.padding = '0';
        dlBtn.style.outline = 'none';
        dlBtn.style.transition = 'all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)';

        let svgIcon = dlBtn.querySelector('svg');
        if (svgIcon) {
            svgIcon.style.width = '18px';
            svgIcon.style.height = '18px';
            svgIcon.style.transform = 'translateY(-1.5px)';
        }

        dlBtn.onmouseenter = () => {
            dlBtn.style.background = 'rgba(255, 255, 255, 0.35)';
            dlBtn.style.transform = 'scale(1.1)';
            dlBtn.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.35)';
        };
        dlBtn.onmouseleave = () => {
            dlBtn.style.background = 'rgba(255, 255, 255, 0.2)';
            dlBtn.style.transform = 'scale(1)';
            dlBtn.style.boxShadow = '0 4px 15px rgba(0, 0, 0, 0.25)';
        };

        overlayRoot.appendChild(dlBtn);

        dlBtn.onclick = async (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            let username = window.location.pathname.split('/').filter(Boolean)[0];
            dlBtn.classList.add('md-loading');

            console.log("MD PFP: Extracting highest resolution...");
            const resolution = await window.MDPfpResolver.resolveBestPfpUrl(profilePic, username, { zoomMaxChecks: 30 });

            // Strict filter: a 150x150 thumbnail is never worth saving.
            if (!resolution || resolution.url.includes('150x150')) {
                console.error("MD PFP Error: Only the 150x150 thumbnail was found, aborting download.");
                dlBtn.classList.remove('md-loading');
                dlBtn.classList.add('md-error');
                if (window.MDToastManager) window.MDToastManager.showError("⚠️ Only a 150x150 profile picture is available.");
                setTimeout(() => {
                    dlBtn.classList.remove('md-error');
                }, 2000);
                return;
            }

            let hdUrl = resolution.url;
            console.log(`MD PFP: Using ${resolution.source} avatar${resolution.isLowRes ? " (low-res, nothing bigger found)" : ""}:`, hdUrl);
            if (resolution.isLowRes && window.MDToastManager) {
                window.MDToastManager.showWarning("⚠️ No full-HD version found; downloading the largest available (≤320px).");
            }

            // Descargar usando la fecha original del CDN
            chrome.runtime.sendMessage({ action: "get_cdn_timestamp", url: hdUrl }, (res) => {
                let finalTimestamp = (res && res.timestamp) ? res.timestamp : Math.floor(Date.now() / 1000);
                
                chrome.runtime.sendMessage({
                    action: "queue_download",
                    url: hdUrl,
                    direct_metadata: {
                        username: username,
                        shortcode: "profile_pic",
                        is_video: false,
                        timestamp: finalTimestamp
                    },
                    mediaType: "direct_story",
                    platform: "instagram"
                }, (response) => {
                    if (response && (response.status === "success" || response.status === "queued")) {
                        console.log("MD PFP queued to host with URL:", hdUrl);
                        dlBtn.classList.remove('md-error', 'md-loading');
                        dlBtn.classList.add('md-success');
                        dlBtn.innerHTML = SVG_CHECK;
                        setTimeout(() => {
                            dlBtn.classList.remove('md-success');
                            dlBtn.innerHTML = SVG_DOWNLOAD;
                        }, 2000);
                    } else {
                        console.error("MD PFP queue failed:", response);
                        dlBtn.classList.remove('md-loading');
                        dlBtn.classList.add('md-error');
                        setTimeout(() => {
                            dlBtn.classList.remove('md-error');
                            dlBtn.innerHTML = SVG_DOWNLOAD;
                        }, 2000);
                    }
                });
            });
        };
    }
}
