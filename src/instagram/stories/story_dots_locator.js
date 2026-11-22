/**
 * @fileoverview Finds the "..." (more options) button of the active story header, next to which the
 * download button is injected (Instagram content script). Runs on every animation frame, so the last
 * match is cached and the full-page scan is throttled.
 * Classic content script: names are global and must stay unique across src/instagram.
 */

const STORY_DOTS_SCAN_INTERVAL_MS = 200;
const STORY_DOTS_CONTAINER_SELECTOR = 'header, section, ._aa61, div[role="dialog"]';
const STORY_DOTS_CLICKABLE_SELECTOR = 'button, [role="button"], div[role="button"]';
const STORY_DOTS_LABELED_SELECTOR = 'button[aria-label], [role="button"][aria-label]';
const STORY_DOTS_EXACT_LABELS = ['more', 'más', 'mas'];
const STORY_DOTS_LABEL_PARTS = ['opciones', 'options'];
const STORY_DOTS_HIJACKED_CLASS = 'md-hijacked-dots';

/** @param {Element} element */
function horizontalDistanceToCenter(element) {
    const rect = element.getBoundingClientRect();
    return Math.abs(rect.left + rect.width / 2 - window.innerWidth / 2);
}

/** Rendered, or already marked by us (Instagram may collapse it while the button sits next to it). @param {Element} element */
function isUsableDots(element) {
    const rect = element.getBoundingClientRect();
    return (rect.width > 0 && rect.height > 0) || element.classList.contains(STORY_DOTS_HIJACKED_CLASS);
}

/** @returns {Element | null} the cached button while it is still the active (centred) slide's */
function cachedDotsIfActive() {
    const cached = window.__md_cachedStoryDots;
    if (!cached || !document.body.contains(cached)) return null;
    // Inactive carousel slides are shifted off-centre by at least half the viewport.
    return horizontalDistanceToCenter(cached) < window.innerWidth / 2 && isUsableDots(cached) ? cached : null;
}

/** @returns {Element[]} clickable parents of three-circle icons, headers first */
function dotsIconCandidates() {
    let icons = [];
    for (const container of document.querySelectorAll(STORY_DOTS_CONTAINER_SELECTOR)) icons.push(...container.querySelectorAll('svg'));
    if (icons.length === 0) icons = Array.from(document.querySelectorAll('svg'));
    return icons
        .filter((icon) => icon.querySelectorAll('circle').length === 3)
        .map((icon) => icon.closest(STORY_DOTS_CLICKABLE_SELECTOR) || icon)
        .filter(isUsableDots);
}

/** @returns {Element[]} buttons labelled "More"/"Options" (fallback if the icon changes) */
function labeledMenuCandidates() {
    return Array.from(document.querySelectorAll(STORY_DOTS_LABELED_SELECTOR)).filter((button) => {
        const label = (button.getAttribute('aria-label') || '').toLowerCase();
        const isMenuLabel = STORY_DOTS_EXACT_LABELS.includes(label) || STORY_DOTS_LABEL_PARTS.some((part) => label.includes(part));
        return isMenuLabel && isUsableDots(button);
    });
}

/** @returns {Element | null} candidate closest to the screen centre (the active slide, not the background feed) */
function scanForStoryDots() {
    const candidates = [];
    for (const candidate of [...dotsIconCandidates(), ...labeledMenuCandidates()]) {
        if (!candidates.includes(candidate)) candidates.push(candidate);
    }
    candidates.sort((a, b) => horizontalDistanceToCenter(a) - horizontalDistanceToCenter(b));
    return candidates.length > 0 ? candidates[0] : null;
}

/** @returns {Element | null} the active story's "..." button; null when absent or while throttled */
function findStoryDotsButton() {
    const cached = cachedDotsIfActive();
    if (cached) return cached;
    if (window.__md_lastStoryButtonScan && Date.now() - window.__md_lastStoryButtonScan < STORY_DOTS_SCAN_INTERVAL_MS) return null;
    window.__md_lastStoryButtonScan = Date.now();
    window.__md_cachedStoryDots = scanForStoryDots();
    return window.__md_cachedStoryDots;
}
