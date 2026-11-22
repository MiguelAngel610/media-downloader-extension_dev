/**
 * @fileoverview Visual state of the story download button (Instagram content script).
 * Instagram re-renders the story header on every slide, so the loading/success state is kept on
 * document.body.__md_download_state (keyed by story) and re-applied to whichever button exists.
 */
import { SVG_DOWNLOAD } from '../ui/svgs.js';
import { getStoryKey } from '../ui/button_state.js';

export const STORY_BUTTON_BASE_CLASS = 'md-native-btn md-story-dl-btn-inline';
const STORY_BUTTON_STATE_TTL_MS = 2000;
const STORY_BUTTON_LOADING_BACKGROUND = 'rgba(255, 255, 255, 0.3)';

/** @returns {string} key of the story slide on screen */
export function currentStoryKey() {
    return getStoryKey();
}

/** Back to the idle download icon. @param {HTMLElement} button */
function resetStoryButton(button) {
    button.className = STORY_BUTTON_BASE_CLASS;
    button.innerHTML = SVG_DOWNLOAD;
    button.style.opacity = '1';
    button.style.background = 'transparent';
}

/** @param {HTMLElement} button */
function hasFinishedOrPendingState(button) {
    return button.classList.contains('md-loading') || button.classList.contains('md-success');
}

/** A new story slide is on screen: the previous slide's ✅ or spinner no longer applies. */
export function resetFinishedStoryButtons() {
    for (const button of document.querySelectorAll('.md-story-dl-btn-inline')) {
        if (hasFinishedOrPendingState(button)) resetStoryButton(button);
    }
}

/**
 * @param {HTMLElement} button
 * @param {string} storyKey - story the click belongs to
 */
export function markStoryButtonLoading(button, storyKey) {
    button.style.background = STORY_BUTTON_LOADING_BACKGROUND;
    button.classList.add('md-loading');
    button.style.opacity = '0.5';
    document.body.__md_download_state = { time: Date.now(), class: 'md-loading', html: SVG_DOWNLOAD, isFloating: true, storyKey };
}

/**
 * Ends a click that did not reach sendDownloadRequest (shared post, no URL, error).
 * @param {HTMLElement} button
 * @param {string} storyKey - story the click belonged to; another story's state is left alone
 */
export function clearStoryButtonLoading(button, storyKey) {
    button.classList.remove('md-loading');
    button.style.opacity = '1';
    button.style.background = 'transparent';
    const state = document.body.__md_download_state;
    if (state && state.storyKey === storyKey) delete document.body.__md_download_state;
}

/**
 * @param {HTMLElement} button
 * @param {{ class: string, html: string }} state
 */
function applyStoryButtonState(button, state) {
    if (button.classList.contains(state.class)) return;
    button.className = `${STORY_BUTTON_BASE_CLASS} ${state.class}`;
    button.innerHTML = state.html;
    if (state.class === 'md-loading') {
        button.style.opacity = '0.5';
        button.style.background = STORY_BUTTON_LOADING_BACKGROUND;
    } else if (state.class === 'md-success') {
        button.style.opacity = '1';
        button.style.background = 'transparent';
    }
}

/** Re-applies a recent state of this story, or resets a stale one. @param {HTMLElement} button */
export function syncStoryButtonState(button) {
    const storyKey = currentStoryKey();
    const state = document.body && document.body.__md_download_state;
    const isThisStory = Boolean(state) && state.storyKey === storyKey;
    if (isThisStory && Date.now() - state.time < STORY_BUTTON_STATE_TTL_MS) {
        applyStoryButtonState(button, state);
        return;
    }
    if (hasFinishedOrPendingState(button)) resetStoryButton(button);
    if (isThisStory) delete document.body.__md_download_state;
}
