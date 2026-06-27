/* Media Downloader - Main Instagram Entry Point: Orchestrates all feature injections */

function injectMinimalistButtons() {
    if (!document.body) return;

    // Inject profile pic button
    injectPfpButton();

    // Inject story button
    injectStoryButton();

    // Inject feed/reel download buttons
    injectFeedButtons();

    // Start the rAF sync loop (only once)
    startSyncLoop();
}

// MutationObserver to re-run injection on DOM changes
const observer = new MutationObserver(() => {
    injectMinimalistButtons();
});

observer.observe(document.documentElement, { childList: true, subtree: true });
injectMinimalistButtons();


// Global click interceptor to defeat invisible overlays
document.addEventListener('click', (e) => {
    let buttons = document.querySelectorAll('.md-native-btn');
    for (let btn of buttons) {
        if (btn.style.visibility === 'hidden' || btn.style.display === 'none') continue;

        let rect = btn.getBoundingClientRect();
        if (e.clientX >= rect.left && e.clientX <= rect.right &&
            e.clientY >= rect.top && e.clientY <= rect.bottom) {

            if (e.target === btn || btn.contains(e.target)) return;

            // An invisible overlay stole the click — steal it back!
            e.preventDefault();
            e.stopPropagation();
            btn.click();
            return;
        }
    }
}, true); // Use capture phase to intercept BEFORE the overlay gets it
