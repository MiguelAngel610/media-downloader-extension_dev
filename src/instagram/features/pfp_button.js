/* Media Downloader - PFP Button: Profile picture download button */

function injectPfpButton() {
    let overlayRoot = getOverlayRoot();
    let profilePic = document.querySelector('header img[alt*="profile picture"], header img[alt*="foto de perfil"]');
    if (profilePic && !profilePic.__md_processed) {
        profilePic.__md_processed = true;
        let id = 'md-pfp-dl';
        profilePic.dataset.mdId = id;

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
            let src = profilePic.src || profilePic.currentSrc;
            if (src) {
                let username = window.location.pathname.split('/').filter(Boolean)[0];
                sendDownloadRequest(dlBtn, src, { username: username, shortcode: 'profile', is_pfp_bot: true }, true);
            }
        };
    }
}
