/* Media Downloader - Main Instagram Entry Point: Orchestrates all feature injections */

function injectMinimalistButtons() {
    if (window.__md_blocked_frame) return;
    if (!document.body) return;

    // Inject profile pic button
    injectPfpButton();

    // Inject feed/reel download buttons
    injectFeedButtons();

    // Start the rAF sync loop (only once)
    startSyncLoop();
}

let mdInjectTimeout = null;
function throttledInject() {
    if (mdInjectTimeout) return;
    mdInjectTimeout = setTimeout(() => {
        injectMinimalistButtons();
        mdInjectTimeout = null;
    }, 150); // Runs max ~6 times a second instead of 60, preventing CPU spikes while feeling instant
}

// MutationObserver to re-run injection on DOM changes
if (window.MDObserverManager) {
    window.MDObserverManager.observeDOM(() => {
        throttledInject();
    });
} else {
    injectMinimalistButtons();
}


// Global click interceptor to defeat invisible overlays
document.addEventListener('click', (e) => {
    if (e.target && e.target.closest && e.target.closest('.md-native-btn, .md-post-btn, .md-story-dl-btn-inline, .md-pfp-btn')) {
        return; // Direct click on button, no recovery calculation needed
    }

    let buttons = document.querySelectorAll('.md-native-btn, .md-post-btn, .md-story-dl-btn-inline, .md-pfp-btn');
    for (let btn of buttons) {
        if (btn.style.visibility === 'hidden' || btn.style.display === 'none') continue;

        let rect = btn.getBoundingClientRect();
        if (e.clientX >= rect.left && e.clientX <= rect.right &&
            e.clientY >= rect.top && e.clientY <= rect.bottom) {

            // An invisible overlay stole the click — steal it back!
            e.preventDefault();
            e.stopPropagation();
            btn.click();
            return;
        }
    }
}, true); // Use capture phase to intercept BEFORE the overlay gets it

// Global Keyboard Shortcut Listener (via ShortcutManager)
if (window.ShortcutManager) {
    window.ShortcutManager.onShortcutPressed(() => {
        // 1. Stories Mode
        if (window.location.pathname.includes('/stories/')) {
            if (typeof injectStoryButton === 'function') injectStoryButton(); // Force injection on the active slide just in case
            
            let storyBtns = Array.from(document.querySelectorAll('.md-story-dl-btn-inline')).filter(b => {
                let r = b.getBoundingClientRect();
                return r.width > 0 && r.left >= -500 && r.left <= window.innerWidth + 500;
            });
            if (storyBtns.length > 0) {
                storyBtns.sort((a, b) => {
                    let aR = a.getBoundingClientRect(), bR = b.getBoundingClientRect();
                    return Math.abs(aR.left + aR.width/2 - window.innerWidth/2) - Math.abs(bR.left + bR.width/2 - window.innerWidth/2);
                })[0].click();
                return;
            }
        }

        // 2. Open Modal Dialog (Post / Reel opened in overlay)
        let openDialog = document.querySelector('div[role="dialog"]');
        if (openDialog) {
            let dialogBtns = Array.from(document.querySelectorAll('.md-in-dialog, div[role="dialog"] .md-story-dl-btn-inline, div[role="dialog"] .md-native-btn')).filter(b => {
                let r = b.getBoundingClientRect();
                return r.width > 0 && r.height > 0;
            });
            if (dialogBtns.length > 0) {
                let vx = window.innerWidth / 2, vy = window.innerHeight / 2;
                dialogBtns.sort((a, b) => {
                    let aR = a.getBoundingClientRect(), bR = b.getBoundingClientRect();
                    return Math.hypot(aR.left + aR.width/2 - vx, aR.top + aR.height/2 - vy) - Math.hypot(bR.left + bR.width/2 - vx, bR.top + bR.height/2 - vy);
                })[0].click();
                return;
            }
        }

        // 3. Single Post / Reel / Feed / Explore Viewport
        let postBtns = Array.from(document.querySelectorAll('.md-post-btn')).filter(b => {
            let r = b.getBoundingClientRect();
            return r.width > 0 && r.height > 0 && r.top >= -50 && r.bottom <= window.innerHeight + 150;
        });
        if (postBtns.length > 0) {
            let vx = window.innerWidth / 2, vy = window.innerHeight / 2;
            postBtns.sort((a, b) => {
                let aR = a.getBoundingClientRect(), bR = b.getBoundingClientRect();
                return Math.hypot(aR.left + aR.width/2 - vx, aR.top + aR.height/2 - vy) - Math.hypot(bR.left + bR.width/2 - vx, bR.top + bR.height/2 - vy);
            })[0].click();
            return;
        }

        // 4. Individual Profile Page (Profile Picture Download if no post or story button matched)
        let pfpBtn = document.getElementById('md-pfp-dl');
        if (pfpBtn) {
            let pfpImg = document.querySelector('header img[alt*="profile picture"], header img[alt*="foto de perfil"]');
            if (pfpImg && document.body.contains(pfpImg)) {
                pfpBtn.click();
                return;
            }
        }

        // 5. Ultimate fallback: click whatever valid download button is visible on screen
        let anyBtn = Array.from(document.querySelectorAll('.md-post-btn, .md-story-dl-btn-inline, .md-pfp-btn, .md-native-btn')).filter(b => {
            let r = b.getBoundingClientRect();
            return r.width > 0 && r.height > 0 && r.top >= -50 && r.bottom <= window.innerHeight + 100 && r.left >= -50 && r.right <= window.innerWidth + 50;
        });
        if (anyBtn.length > 0) {
            let vx = window.innerWidth / 2, vy = window.innerHeight / 2;
            anyBtn.sort((a, b) => {
                let aR = a.getBoundingClientRect(), bR = b.getBoundingClientRect();
                return Math.hypot(aR.left + aR.width/2 - vx, aR.top + aR.height/2 - vy) - Math.hypot(bR.left + bR.width/2 - vx, bR.top + bR.height/2 - vy);
            })[0].click();
        } else {
            if (window.MDToastManager) {
                window.MDToastManager.showWarning("⚠️ Shortcut: No media or download button found on screen.");
            }
        }
    });
}
