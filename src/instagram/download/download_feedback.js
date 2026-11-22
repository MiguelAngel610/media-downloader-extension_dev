/**
 * @fileoverview Visual feedback of a download request on its button (Instagram content script).
 * The state is also stored on the post container (or <body> in stories) so that a button React
 * re-creates during the request can be re-synced by the injectors.
 * Classic content script: names are global and must stay unique across src/instagram.
 */

const DOWNLOAD_STATE_RESET_MS = 2000;
const DOWNLOAD_STATE_CONTAINER_SELECTOR = 'article, main, div[role="dialog"]';

/**
 * @typedef {Object} DownloadFeedbackContext
 * @property {Element} button
 * @property {Element | null} holder - element that carries __md_download_state
 * @property {boolean} isFloating
 * @property {string | null} storyKey - story slide the request was made on (null outside stories)
 */

/**
 * @param {Element} button
 * @param {Element | null} originalElement
 * @param {boolean} storyContext
 * @returns {Element | null}
 */
function downloadStateHolder(button, originalElement, storyContext) {
    return storyContext ? document.body : (originalElement || button).closest(DOWNLOAD_STATE_CONTAINER_SELECTOR);
}

/**
 * @param {DownloadFeedbackContext} context
 * @param {'md-loading' | 'md-success' | 'md-error'} stateClass
 * @param {string} iconSvg
 */
function saveDownloadState(context, stateClass, iconSvg) {
    if (!context.holder) return;
    context.holder.__md_download_state = {
        time: Date.now(),
        class: stateClass,
        html: iconSvg,
        isFloating: context.isFloating,
        storyKey: context.storyKey,
    };
}

/**
 * After a short delay the button returns to its idle icon and the stored state is cleared
 * (unless a newer request on another story slide replaced it).
 * @param {DownloadFeedbackContext} context
 * @param {boolean} resetButton - false when the user already moved to another story slide
 */
function scheduleDownloadStateReset(context, resetButton) {
    setTimeout(() => {
        if (resetButton) {
            context.button.classList.remove('md-success', 'md-error');
            updateButtonIcon(context.button, SVG_DOWNLOAD, context.isFloating);
        }
        const state = context.holder && context.holder.__md_download_state;
        if (context.holder && (!state || state.storyKey === context.storyKey)) delete context.holder.__md_download_state;
    }, DOWNLOAD_STATE_RESET_MS);
}

/**
 * A blob: URL that cannot be mapped to a page URL: nothing can be downloaded.
 * @param {DownloadFeedbackContext} context
 */
function showUnresolvableBlob(context) {
    console.error("Media Downloader: Cannot resolve original URL for blob.");
    context.button.classList.remove('md-loading');
    context.button.classList.add('md-error');
    saveDownloadState(context, 'md-error', SVG_DOWNLOAD);
    scheduleDownloadStateReset(context, true);
}

/**
 * @param {unknown} response - answer of the service worker to queue_download
 * @returns {string | null} rejection reason, or null when the request was queued
 */
function queueRejectionReason(response) {
    if (chrome.runtime.lastError) return chrome.runtime.lastError.message;
    if (!response || response.status === 'error') return (response && response.message) || "Unknown error";
    return null;
}

/**
 * "queued" only means the request reached the host; the real result arrives later as host_response.
 * @param {DownloadFeedbackContext} context
 * @param {unknown} response
 */
function showQueueOutcome(context, response) {
    const { button } = context;
    button.classList.remove('md-loading');
    const reason = queueRejectionReason(response);
    if (reason !== null) {
        console.error("Media Downloader: download request rejected:", reason);
        if (window.MDToastManager) window.MDToastManager.showError("❌ Download not started", 5000, reason);
    }
    const stateClass = reason !== null ? 'md-error' : 'md-success';
    const stateIcon = reason !== null ? SVG_DOWNLOAD : SVG_CHECK;

    // The user may have moved to another story slide while the request was in flight.
    const activeStoryKey = isStoryContext(button) ? getStoryKey() : null;
    const isSameStory = !context.storyKey || activeStoryKey === context.storyKey;
    if (isSameStory) {
        button.classList.add(stateClass);
        updateButtonIcon(button, stateIcon, context.isFloating);
    } else {
        button.classList.remove('md-success', 'md-error');
        updateButtonIcon(button, SVG_DOWNLOAD, context.isFloating);
    }
    saveDownloadState(context, stateClass, stateIcon);
    scheduleDownloadStateReset(context, isSameStory);
}
