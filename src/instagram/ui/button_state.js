/**
 * @fileoverview Download button icon/state helpers and the download request entry point (Instagram content script).
 * Classic content script: names are global and must stay unique across src/instagram.
 */

const BUTTON_STORY_KEY_IN_PATH = /\/stories\/([^/?#]+)(?:\/(\d+))?/;

/**
 * Swaps the button icon. Native-looking buttons keep the original SVG's class/color so they still
 * match Instagram's theme; floating buttons simply replace their content.
 * @param {Element} btn
 * @param {string} newSvgCode - trusted static SVG markup (svgs.js)
 * @param {boolean} isFloating
 */
function updateButtonIcon(btn, newSvgCode, isFloating) {
    if (isFloating) {
        btn.innerHTML = newSvgCode;
        return;
    }
    const oldSvg = btn.querySelector('svg');
    if (!oldSvg) return;
    const template = document.createElement('div');
    template.innerHTML = newSvgCode;
    const newSvg = template.querySelector('svg');
    if (!newSvg) return;
    if (oldSvg.hasAttribute('class')) newSvg.setAttribute('class', oldSvg.getAttribute('class'));
    if (oldSvg.hasAttribute('color')) newSvg.setAttribute('color', oldSvg.getAttribute('color'));
    newSvg.setAttribute('fill', 'none');
    newSvg.setAttribute('stroke-width', '2');
    oldSvg.replaceWith(newSvg);
}

/**
 * Identifies the story slide on screen ("user/storyId"), or the page path outside stories.
 * @returns {string}
 */
function getStoryKey() {
    const match = window.location.href.match(BUTTON_STORY_KEY_IN_PATH);
    if (!match) return window.location.pathname;
    const userOrType = match[1];
    const storyId = new URLSearchParams(window.location.search).get('story_media_id') || match[2] || '';
    return storyId ? `${userOrType}/${storyId}` : userOrType;
}
window.getStoryKey = getStoryKey;

/**
 * Sends one download to the host and drives the button feedback.
 * Steps: loading state -> complete metadata (download_metadata.js) -> choose URL and strategy
 * (download_target.js) -> queue_download -> success/error feedback (download_feedback.js).
 * @param {Element} btn
 * @param {string | null | undefined} url - CDN URL, page URL or blob: URL of the media
 * @param {Record<string, any> | null | undefined} metadata - partial metadata from the resolvers (mutated)
 * @param {boolean} [isFloating]
 * @param {Element | null} [originalElement] - the post element when btn lives in the overlay root
 */
function sendDownloadRequest(btn, url, metadata, isFloating = false, originalElement = null) {
    btn.classList.add('md-loading');
    const storyContext = isStoryContext(btn);
    /** @type {DownloadFeedbackContext} */
    const feedback = {
        button: btn,
        holder: downloadStateHolder(btn, originalElement, storyContext),
        isFloating,
        storyKey: storyContext ? getStoryKey() : null,
    };
    saveDownloadState(feedback, 'md-loading', SVG_DOWNLOAD);

    const completedMetadata = completeDownloadMetadata(metadata, btn, originalElement, url);
    if (!chrome.runtime || !chrome.runtime.id) {
        alert("La extensión fue actualizada. Por favor, recarga esta pestaña de Instagram para seguir descargando.");
        btn.classList.remove('md-loading');
        return;
    }

    chrome.storage.local.get(['selectedAccount'], (result) => {
        const target = resolveDownloadTarget(btn, url, completedMetadata);
        if (!target) {
            showUnresolvableBlob(feedback);
            return;
        }
        if (!completedMetadata.media_category) completedMetadata.media_category = "post";
        if (window.MDToastManager) window.MDToastManager.showInfo("⏳ Starting download...");
        chrome.runtime.sendMessage({
            action: "queue_download",
            url: target.url,
            mediaType: target.mediaType,
            platform: getPlatform(),
            account: result.selectedAccount || 'M',
            direct_metadata: completedMetadata,
        }, (response) => showQueueOutcome(feedback, response));
    });
}
