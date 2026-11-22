/**
 * @fileoverview Media elements of the story on screen: its playing video(s) and any playing audio
 * (music stickers). Used to drive the progress slider and to seek when it is dragged.
 */
import { horizontalOffsetFromCenter, isStyleVisible, sortByHorizontalCenter } from '../../../utils/viewport.js';

const ANCHOR_DOTS_MAX_TOP_PX = 300;
const ANCHOR_DOTS_MIN_TOP_PX = -20;
const ANCHOR_DOTS_MAX_CENTER_OFFSET_PX = 500;
const STORY_VISUAL_MIN_SIZE_PX = 150;
const STORY_VISUAL_MAX_CENTER_OFFSET_PX = 400;
const MAX_ANCESTOR_CLIMBS = 12;

/** @param {Element} element */
function isHeaderDots(element) {
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.top >= ANCHOR_DOTS_MIN_TOP_PX && rect.top <= ANCHOR_DOTS_MAX_TOP_PX
        && horizontalOffsetFromCenter(rect) < ANCHOR_DOTS_MAX_CENTER_OFFSET_PX;
}

/** @returns {Element | null} our story download button, else Instagram's "..." button, of the centred story */
function findStoryHeaderAnchor() {
    const downloadButtons = Array.from(document.querySelectorAll('.md-story-dl-btn-inline'));
    if (downloadButtons.length > 0) return sortByHorizontalCenter(downloadButtons)[0];
    const dots = Array.from(document.querySelectorAll('header svg, ._aa61 svg, section svg, svg'))
        .filter((icon) => icon.querySelectorAll('circle').length === 3)
        .map((icon) => icon.closest('button, [role="button"], div[role="button"]') || icon)
        .filter(isHeaderDots);
    return dots.length > 0 ? sortByHorizontalCenter(dots)[0] : null;
}

/** @param {Element} element */
function isStoryVisual(element) {
    const rect = element.getBoundingClientRect();
    return rect.width > STORY_VISUAL_MIN_SIZE_PX && rect.height > STORY_VISUAL_MIN_SIZE_PX && rect.right > 0 && rect.left < window.innerWidth
        && horizontalOffsetFromCenter(rect) < STORY_VISUAL_MAX_CENTER_OFFSET_PX;
}

/** @param {Element} element */
function isPlayableVideo(element) {
    return element.tagName.toLowerCase() === 'video' && !element.ended && isStyleVisible(element);
}

/**
 * Climbs from the header anchor to the first ancestor that holds the story visuals.
 * A photo story stops there with no video.
 * @param {Element} anchor
 * @returns {HTMLVideoElement[]}
 */
function storyVideosNear(anchor) {
    let ancestor = anchor.parentElement;
    for (let climbs = 0; ancestor && ancestor !== document.body && climbs < MAX_ANCESTOR_CLIMBS; climbs++) {
        const visuals = Array.from(ancestor.querySelectorAll('video, img')).filter(isStoryVisual);
        if (visuals.length > 0) return visuals.filter(isPlayableVideo);
        ancestor = ancestor.parentElement;
    }
    return [];
}

/** @param {HTMLMediaElement} audio */
function isPlayingAudio(audio) {
    return !audio.paused && !audio.ended && !isNaN(audio.duration) && audio.duration > 0;
}

/** @returns {HTMLMediaElement[]} videos of the centred story first, then playing audio elements */
export function getActiveStoryMedias() {
    const anchor = findStoryHeaderAnchor();
    const result = anchor ? storyVideosNear(anchor) : [];
    for (const audio of document.querySelectorAll('audio')) {
        if (isPlayingAudio(audio) && !result.includes(audio)) result.push(audio);
    }
    return result;
}
