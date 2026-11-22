/**
 * @fileoverview Finds Instagram's row of story segment bars (the thin bars at the top of a story),
 * where the custom slider is mounted. Runs every frame: the row is cached and the DOM scan is throttled.
 */
import { horizontalOffsetFromCenter } from '../../../utils/viewport.js';

export const PROGRESS_CONTAINER_ID = 'md-story-progress-container';

const HEAVY_SCAN_INTERVAL_MS = 250;
const ROW_MIN_WIDTH_PX = 150;
const ROW_MIN_TOP_PX = -30;
const ROW_MAX_TOP_PX = 120;
const ROW_MAX_HEIGHT_PX = 25;
const ROW_MAX_CENTER_OFFSET_PX = 360;
const FILL_MAX_CLIMBS = 4;
const STRUCTURAL_MAX_CHILDREN = 150;
const SAME_COLUMN_TOLERANCE_PX = 100;
const FORBIDDEN_CHILD_TAGS = ['svg', 'button', 'img', 'header', 'canvas'];
const FORBIDDEN_DESCENDANTS = 'button, [role="button"], svg, img, header, canvas, .md-story-dl-btn-inline';
const COUNTER_TEXT = /^\d+\/\d+$/;

/** @param {Element} row @returns {Element[]} segment bars, without our own container */
export function nativeSegmentsOf(row) {
    return Array.from(row.children).filter((child) => child.id !== PROGRESS_CONTAINER_ID);
}

/** Thin, horizontal, near the top and in the centred story column. @param {Element} row */
function hasSegmentRowGeometry(row) {
    const display = window.getComputedStyle(row).display;
    if (display !== 'flex' && display !== 'grid') return false;
    const rect = row.getBoundingClientRect();
    if (rect.width < ROW_MIN_WIDTH_PX || rect.top < ROW_MIN_TOP_PX || rect.top > ROW_MAX_TOP_PX || rect.height === 0 || rect.height > ROW_MAX_HEIGHT_PX) return false;
    return horizontalOffsetFromCenter(rect) < ROW_MAX_CENTER_OFFSET_PX;
}

/** Segment bars never contain buttons, icons, avatars or text (other than an "n/m" counter). @param {Element} segment */
function isBareSegment(segment) {
    if (FORBIDDEN_CHILD_TAGS.includes(segment.tagName.toLowerCase())) return false;
    if (segment.querySelector(FORBIDDEN_DESCENDANTS)) return false;
    const text = segment.textContent ? segment.textContent.trim() : '';
    return text.length === 0 || COUNTER_TEXT.test(text);
}

/** @param {Element | null} row */
export function isValidSegmentRow(row) {
    if (!row || !row.children || !hasSegmentRowGeometry(row)) return false;
    const segments = nativeSegmentsOf(row);
    return segments.length > 0 && segments.every(isBareSegment);
}

/** @returns {Element | null} the cached row while it is attached and rendered */
function cachedSegmentRow() {
    const cached = window.__md_cachedSegmentsContainer;
    if (cached && document.body.contains(cached)) return cached.getBoundingClientRect().width > 0 ? cached : null;
    if (cached) {
        window.__md_cachedSegmentsContainer = null;
        window.__md_lastHeavySearch = 0; // rescan in this same frame: waiting 250 ms makes the bar flicker
    }
    return null;
}

/** Segment fills are styled inline (width/transform); their row is a few ancestors up. @param {Element[]} rows */
function collectRowsAboveFills(rows) {
    for (const fill of document.querySelectorAll('div[style*="width:"], div[style*="transform:"]')) {
        let current = fill.parentElement;
        for (let climbs = 0; current && climbs < FILL_MAX_CLIMBS; climbs++) {
            if (isValidSegmentRow(current) && !rows.includes(current)) {
                rows.push(current);
                break;
            }
            current = current.parentElement;
        }
    }
}

/** Fallback when no fill is styled inline yet (first frame of a story). @param {Element[]} rows */
function collectRowsByStructure(rows) {
    const scope = document.querySelector('section, div[role="dialog"], main, ._aa61') || document.body;
    for (const candidate of scope.querySelectorAll('div')) {
        if (candidate.children.length === 0 || candidate.children.length > STRUCTURAL_MAX_CHILDREN) continue;
        if (isValidSegmentRow(candidate) && !rows.includes(candidate)) rows.push(candidate);
    }
}

/** Centre column first; inside it, the topmost bar is the real segment indicator. */
function compareSegmentRows(a, b) {
    const aRect = a.getBoundingClientRect();
    const bRect = b.getBoundingClientRect();
    const aOffset = horizontalOffsetFromCenter(aRect);
    const bOffset = horizontalOffsetFromCenter(bRect);
    if (Math.abs(aOffset - bOffset) > SAME_COLUMN_TOLERANCE_PX) return aOffset - bOffset;
    return aRect.top - bRect.top;
}

/** @returns {Element | null} the active story's segment row; null when absent or while throttled */
export function findSegmentRow() {
    const cached = cachedSegmentRow();
    if (cached) return cached;
    if (window.__md_lastHeavySearch && Date.now() - window.__md_lastHeavySearch <= HEAVY_SCAN_INTERVAL_MS) return null;
    window.__md_lastHeavySearch = Date.now();
    const rows = [];
    collectRowsAboveFills(rows);
    if (rows.length === 0) collectRowsByStructure(rows);
    rows.sort(compareSegmentRows);
    return rows[0] || null;
}
