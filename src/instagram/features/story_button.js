/**
 * @fileoverview Story download button, injected next to the "..." of the active story header
 * (Instagram content script). Finding the header button (stories/story_dots_locator.js), the media
 * (stories/story_media_locator.js), its best URL (stories/story_media_lookup.js) and the button state
 * (stories/story_button_state.js) live in their own modules; this file wires them together.
 */
import { STORY_BUTTON_BASE_CLASS, clearStoryButtonLoading, currentStoryKey, markStoryButtonLoading, resetFinishedStoryButtons, syncStoryButtonState } from '../stories/story_button_state.js';
import { STORY_DOTS_HIJACKED_CLASS, findStoryDotsButton } from '../stories/story_dots_locator.js';
import { SVG_DOWNLOAD } from '../ui/svgs.js';
import { detectSharedReelOrPost } from '../stories/shared_post_detector.js';
import { findStoryMediaElement } from '../stories/story_media_locator.js';
import { resolveStoryMedia } from '../stories/story_media_lookup.js';
import { sendDownloadRequest } from '../ui/button_state.js';

const STORY_SHARED_WARNING_DURATION_MS = 8000;

/** @param {SharedPostDetection} info */
function showSharedReelWarning(info) {
    if (!window.MDToastManager) return;
    const typeText = info.isReel ? 'Reel' : 'Post';
    // info.href is read from Instagram's DOM: the toast validates it (http/https only) and
    // builds the link with DOM APIs, so it can never inject markup or a javascript: URL.
    window.MDToastManager.showComplex({
        title: `Shared ${typeText} Detected`,
        icon: '⚠️',
        body: `To preserve studio FHD quality and aesthetics, downloading shared ${typeText.toLowerCase()}s directly from stories is disabled to prevent cropped media, re-compression, and baked-in interface overlays.`,
        action: { label: `Open Full ${typeText}`, href: info.href || null },
        onAction: () => {
            if (info.href || !info.element) return;
            try {
                info.element.click();
            } catch (err) {
                console.error('[MD] Could not open the shared media element:', err);
            }
        },
        duration: STORY_SHARED_WARNING_DURATION_MS,
    });
}

/** @returns {SharedPostDetection} never throws: a failed detection must not block the download */
function detectSharedPostSafely() {
    try {
        return detectSharedReelOrPost();
    } catch (err) {
        console.error('detectSharedReelOrPost error:', err);
        return { detected: false };
    }
}

/**
 * @param {HTMLElement} button
 * @param {Event} event
 */
async function handleStoryDownloadClick(button, event) {
    event.preventDefault();
    event.stopPropagation();
    // Captured at click time: the user may move to the next story before the request finishes.
    const clickStoryKey = currentStoryKey();
    try {
        if (window.MDToastManager) window.MDToastManager.showInfo('Starting download...');
        markStoryButtonLoading(button, clickStoryKey);

        const shared = detectSharedPostSafely();
        if (shared && shared.detected) {
            showSharedReelWarning(shared);
            clearStoryButtonLoading(button, clickStoryKey);
            return;
        }

        const { bestUrl, bestMetadata } = await resolveStoryMedia(findStoryMediaElement(button));
        if (!bestUrl && !window.location.href.includes('/stories/')) {
            console.error('Media Downloader: Could not find media URL.');
            clearStoryButtonLoading(button, clickStoryKey);
            return;
        }
        bestMetadata.media_category = 'story';
        sendDownloadRequest(button, bestUrl || window.location.href, bestMetadata, true);
    } catch (err) {
        console.error('Story Download Error:', err);
        clearStoryButtonLoading(button, clickStoryKey);
        if (window.MDToastManager) window.MDToastManager.showError('Err: ' + (err.message || err.toString()));
    }
}

/** @returns {HTMLDivElement} */
function createStoryDownloadButton() {
    const button = document.createElement('div');
    button.className = STORY_BUTTON_BASE_CLASS;
    button.innerHTML = SVG_DOWNLOAD;
    Object.assign(button.style, {
        color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '8px', margin: '0', lineHeight: '0', background: 'transparent',
        pointerEvents: 'auto', // clickable even when the header disables pointer events
        zIndex: '9999',
    });
    button.title = 'Download Story';
    button.onmouseenter = () => { button.style.opacity = '0.5'; };
    button.onmouseleave = () => { button.style.opacity = '1'; };
    button.onclick = (event) => handleStoryDownloadClick(button, event);
    return button;
}

/** Called on every frame by the progress loop and on navigation; cheap when nothing changed. */
export function injectStoryButton() {
    if (!window.location.href.includes('/stories/')) return;

    const storyKey = currentStoryKey();
    if (window.__md_lastActiveStoryKey && window.__md_lastActiveStoryKey !== storyKey) {
        window.__md_cachedStoryDots = null;
        resetFinishedStoryButtons();
    }
    window.__md_lastActiveStoryKey = storyKey;

    const dotsButton = findStoryDotsButton();
    if (!dotsButton) return;
    dotsButton.classList.add(STORY_DOTS_HIJACKED_CLASS);

    const existing = dotsButton.previousElementSibling;
    if (existing && existing.classList.contains('md-story-dl-btn-inline')) {
        syncStoryButtonState(existing);
        return;
    }
    // Instagram re-rendered the header: move our button back next to the new "..." button.
    const header = dotsButton.closest('header, section, ._aa61') || dotsButton.parentNode;
    const orphaned = header.querySelector('.md-story-dl-btn-inline');
    const button = orphaned || createStoryDownloadButton();
    dotsButton.parentNode.insertBefore(button, dotsButton);
    syncStoryButtonState(button);
}

