/**
 * @fileoverview Story progress bar: replaces Instagram's segment bars with a draggable slider and an
 * "n/total" counter. Runs every frame from feed.js; the pieces live in ./story/.
 */
import { getActiveStoryMedias } from './story/active_media.js';
import { COUNTER_ID, SLIDER_ID, ensureProgressContainer } from './story/progress_slider.js';
import { findActiveSegment } from './story/segment_progress.js';
import { findSegmentRow, nativeSegmentsOf } from './story/segment_row.js';

export { getActiveStoryMedias };

const HIDE_NATIVE_CLASS = 'md-hide-native-segments';
const MEDIA_REFRESH_INTERVAL_MS = 250;
// Instagram pauses each story at ~98.5 %: boosting 1.5 % lets the slider reach the end naturally.
const VISUAL_PROGRESS_BOOST = 1.015;

/** Only our row keeps Instagram's own bars hidden. @param {Element} segmentRow */
function hideNativeSegments(segmentRow) {
    document.querySelectorAll(`.${HIDE_NATIVE_CLASS}`).forEach((element) => {
        if (element !== segmentRow) element.classList.remove(HIDE_NATIVE_CLASS);
    });
    segmentRow.classList.add(HIDE_NATIVE_CLASS);
}

/** @param {Element} container @param {number} index @param {number} total */
function updateCounter(container, index, total) {
    const counter = container.querySelector(`#${COUNTER_ID}`);
    if (!counter) return;
    const formatted = `${index}/${total}`;
    if (counter.textContent !== formatted) counter.textContent = formatted;
}

/** Re-reads the story media at most every 250 ms (or on a segment change) to avoid layout thrashing. */
function refreshCachedMedias(slider, segmentIndex) {
    const now = Date.now();
    if (slider.__md_lastMediaCheck && now - slider.__md_lastMediaCheck <= MEDIA_REFRESH_INTERVAL_MS && slider.__md_lastSegmentIndex === segmentIndex) return;
    slider.__md_lastMediaCheck = now;
    slider.__md_lastSegmentIndex = segmentIndex;
    slider.__md_cachedMedias = getActiveStoryMedias();
    slider.__md_isPhotoOnly = slider.__md_cachedMedias.length === 0;
}

/**
 * A video's own time is more precise than the bar width; the first video wins over audio after it.
 * @param {HTMLMediaElement[]} medias
 * @param {number} segmentPercent
 */
function playbackPercent(medias, segmentPercent) {
    let percent = segmentPercent;
    for (const media of medias) {
        if (!isNaN(media.duration) && media.duration > 0) percent = (media.currentTime / media.duration) * 100;
        if (media.tagName.toLowerCase() === 'video') break;
    }
    return percent;
}

/** @param {HTMLInputElement} slider @param {number} segmentPercent */
function updateSlider(slider, segmentPercent) {
    if (slider.__md_isDragging) return;
    const visualPercent = Math.min(100, playbackPercent(slider.__md_cachedMedias || [], segmentPercent) * VISUAL_PROGRESS_BOOST);
    slider.value = visualPercent;
    slider.style.setProperty('--md-progress', `${visualPercent}%`);
}

export function syncStoryProgressBar() {
    try {
        if (!window.location.pathname.includes('/stories/')) return;
        const segmentRow = findSegmentRow();
        if (!segmentRow) return;
        window.__md_cachedSegmentsContainer = segmentRow;

        const container = ensureProgressContainer(segmentRow);
        hideNativeSegments(segmentRow);

        const segments = nativeSegmentsOf(segmentRow);
        const active = findActiveSegment(segments, window.__md_lastKnownSegmentIndex || 1);
        window.__md_lastKnownSegmentIndex = active.index;
        updateCounter(container, active.index, Math.max(segments.length, 1));

        const slider = container.querySelector(`#${SLIDER_ID}`);
        if (!slider) return;
        refreshCachedMedias(slider, active.index);
        updateSlider(slider, active.percent);
    } catch (err) {
        console.error('Media Downloader syncStoryProgressBar error:', err);
    }
}
