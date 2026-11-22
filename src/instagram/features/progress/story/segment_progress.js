/**
 * @fileoverview Which story segment is playing and how far, read from the width of Instagram's bars.
 */

const FILL_MAX_HEIGHT_PX = 15;
const FILL_WIDTH_TOLERANCE_PX = 2;
const STARTED_PERCENT = 0.5;
const COMPLETE_PERCENT = 99.5;

/**
 * @typedef {Object} ActiveSegment
 * @property {number} index - 1-based
 * @property {number} percent - 0..100
 */

/**
 * The narrowest thin bar inside the segment is its fill (the segment itself counts as 100 %).
 * @param {Element} segment
 * @returns {number} 0..100
 */
export function measureSegmentProgress(segment) {
    const segmentRect = segment.getBoundingClientRect();
    if (segmentRect.width === 0) return 0;
    let minPercent = 100;
    for (const node of [segment, ...segment.querySelectorAll('div')]) {
        const rect = node.getBoundingClientRect();
        if (rect.height <= 0 || rect.height > FILL_MAX_HEIGHT_PX || rect.width > segmentRect.width + FILL_WIDTH_TOLERANCE_PX) continue;
        const visibleWidth = Math.max(0, Math.min(rect.right, segmentRect.right) - Math.max(rect.left, segmentRect.left));
        minPercent = Math.min(minPercent, Math.max(0, Math.min(100, (visibleWidth / segmentRect.width) * 100)));
    }
    return minPercent;
}

/**
 * Fast path for 60 FPS: only the last known segment (and the next one when it just completed).
 * @param {Element[]} segments
 * @param {number} lastIndex - 1-based
 * @returns {ActiveSegment | null}
 */
function checkLastKnownSegment(segments, lastIndex) {
    if (lastIndex < 1 || lastIndex > segments.length) return null;
    const percent = measureSegmentProgress(segments[lastIndex - 1]);
    if (percent >= STARTED_PERCENT && percent < COMPLETE_PERCENT) return { index: lastIndex, percent };
    if (percent < COMPLETE_PERCENT || lastIndex >= segments.length) return null;
    const nextPercent = measureSegmentProgress(segments[lastIndex]);
    return nextPercent < COMPLETE_PERCENT ? { index: lastIndex + 1, percent: nextPercent } : null;
}

/**
 * Full scan (story change or first frame): the first segment that is not complete.
 * @param {Element[]} segments
 * @returns {ActiveSegment} the last segment at 0 % when all are complete
 */
function scanSegments(segments) {
    for (let i = 0; i < segments.length; i++) {
        const percent = measureSegmentProgress(segments[i]);
        if (percent < STARTED_PERCENT) return { index: i + 1, percent: 0 };
        if (percent < COMPLETE_PERCENT) return { index: i + 1, percent };
    }
    return { index: Math.max(segments.length, 1), percent: 0 };
}

/**
 * @param {Element[]} segments
 * @param {number} lastIndex - 1-based index found on the previous frame
 * @returns {ActiveSegment}
 */
export function findActiveSegment(segments, lastIndex) {
    return checkLastKnownSegment(segments, lastIndex) || scanSegments(segments);
}
