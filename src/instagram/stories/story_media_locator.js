/**
 * @fileoverview Finds the <video>/<img> of the story on screen (Instagram content script).
 * First near the download button (same story card), then the largest centred media of the page.
 */
import { horizontalOffsetFromCenter } from '../utils/viewport.js';

const STORY_MEDIA_MAX_ANCESTOR_CLIMBS = 12;
const STORY_MEDIA_MIN_SIZE_NEAR_BUTTON_PX = 150;
const STORY_MEDIA_MIN_SIZE_PAGE_PX = 200;
const STORY_MEDIA_MAX_CENTER_OFFSET_PX = 450;
const STORY_MEDIA_SAME_DISTANCE_PX = 10;

/** @param {DOMRect} rect */
function isHorizontallyOnScreen(rect) {
    return rect.right > 0 && rect.left < window.innerWidth;
}

/**
 * @param {HTMLElement} button - the injected download button
 * @returns {HTMLElement | null} media inside the closest ancestor that has any (a video wins over its poster image)
 */
function findMediaNearButton(button) {
    let ancestor = button.parentElement;
    for (let climbs = 0; ancestor && ancestor !== document.body && climbs < STORY_MEDIA_MAX_ANCESTOR_CLIMBS; climbs++) {
        const medias = Array.from(ancestor.querySelectorAll('video, img')).filter((element) => {
            const rect = element.getBoundingClientRect();
            return rect.width > STORY_MEDIA_MIN_SIZE_NEAR_BUTTON_PX && rect.height > STORY_MEDIA_MIN_SIZE_NEAR_BUTTON_PX && isHorizontallyOnScreen(rect);
        });
        if (medias.length > 0) return medias.find((element) => element.tagName === 'VIDEO') || medias[0];
        ancestor = ancestor.parentElement;
    }
    return null;
}

/** Closest to the screen centre; at (almost) the same distance, the larger one. */
function compareByCenterThenArea(a, b) {
    const aRect = a.getBoundingClientRect();
    const bRect = b.getBoundingClientRect();
    const aDistance = horizontalOffsetFromCenter(aRect);
    const bDistance = horizontalOffsetFromCenter(bRect);
    if (Math.abs(aDistance - bDistance) < STORY_MEDIA_SAME_DISTANCE_PX) return bRect.width * bRect.height - aRect.width * aRect.height;
    return aDistance - bDistance;
}

/** @returns {HTMLElement | null} */
function findCenteredPageMedia() {
    const candidates = Array.from(document.querySelectorAll('video, img')).filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > STORY_MEDIA_MIN_SIZE_PAGE_PX && rect.height > STORY_MEDIA_MIN_SIZE_PAGE_PX && isHorizontallyOnScreen(rect)
            && horizontalOffsetFromCenter(rect) < STORY_MEDIA_MAX_CENTER_OFFSET_PX;
    }).sort(compareByCenterThenArea);
    return candidates.length > 0 ? candidates[0] : null;
}

/** @param {HTMLElement} button @returns {HTMLElement | null} */
export function findStoryMediaElement(button) {
    return findMediaNearButton(button) || findCenteredPageMedia();
}

/**
 * @param {HTMLElement} media
 * @returns {string | undefined} the URL the element plays/shows (often a blob: URL for videos)
 */
export function directMediaUrl(media) {
    const url = media.src || media.currentSrc;
    if (media.tagName === 'VIDEO' && !url) {
        const source = media.querySelector('source');
        if (source) return source.src;
    }
    return url;
}
