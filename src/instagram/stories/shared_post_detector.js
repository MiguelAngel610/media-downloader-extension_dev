/**
 * @fileoverview Detects a story that re-shares a feed post or reel (Instagram content script).
 * Those stories only contain a low-quality preview, so the story button warns the user and links
 * to the original. Strategies run from most to least reliable; the first match wins.
 */
import { STORY_BODY_HEIGHT, STORY_FULL_HEIGHT, currentStoryId, isExtensionUi, isInStoryColumn, isRenderedVisible, nearestLinkHref } from './story_viewport.js';

const SHARED_POST_LINK_SELECTOR = 'a[href*="/reel/"], a[href*="/reels/"], a[href*="/p/"], a[href*="/tv/"]';
const SHARED_POST_REEL_PATHS = ['/reel/', '/reels/', '/tv/'];
// "See post", "Watch full reel", "Ver reel completo", "Ver publicación", "See photo"...
const SHARED_POST_BADGE_TEXT = /(?:watch|ver|view|see|mirar)\s+(?:full\s+)?(?:reel|post|publicaci[oó]n|video|v[íi]deo|igv|photo|foto|content|contenido)/i;
const SHARED_POST_BADGE_IS_REEL = /reel|video|v[íi]deo|igv/i;
const SHARED_POST_WARNING_TOAST_ID = 'md-reel-warning-toast';

/**
 * @typedef {Object} SharedPostDetection
 * @property {boolean} detected
 * @property {boolean} [isReel]
 * @property {string} [label]
 * @property {string | null} [href]
 * @property {Element} [element] - element the warning can point at
 */

/**
 * Ground truth: the shared_item the interceptor parsed from the API response for this story.
 * @returns {SharedPostDetection | null}
 */
function sharedItemFromDictionary() {
    const storyId = currentStoryId();
    const entry = storyId && window.__md_storyMediaDict ? window.__md_storyMediaDict[storyId] : null;
    return entry && entry.shared_item ? { detected: true, ...entry.shared_item } : null;
}

/** @returns {SharedPostDetection | null} a visible reel/post/IGTV link inside the story */
function findSharedPostLink() {
    for (const link of document.querySelectorAll(SHARED_POST_LINK_SELECTOR)) {
        if (isExtensionUi(link) || !isInStoryColumn(link, STORY_FULL_HEIGHT) || !isRenderedVisible(link)) continue;
        const href = link.getAttribute('href') || '';
        const isReel = SHARED_POST_REEL_PATHS.some((path) => href.includes(path));
        const label = link.textContent.trim() || (isReel ? 'Watch full reel' : 'See post');
        return { detected: true, isReel, label, href: link.href, element: link };
    }
    return null;
}

/** @param {Element} element */
function isBadgeCandidate(element) {
    if (element.children.length > 2 || !element.textContent) return false;
    const text = element.textContent.trim();
    return text.length >= 4 && text.length <= 50 && SHARED_POST_BADGE_TEXT.test(text);
}

/**
 * @param {Element[]} elements - every element of the page, in document order
 * @returns {SharedPostDetection | null} a "See post"-style badge inside the story
 */
function findSharedPostBadge(elements) {
    for (const element of elements) {
        if (isExtensionUi(element) || !isBadgeCandidate(element)) continue;
        if (!isRenderedVisible(element) || !isInStoryColumn(element, STORY_FULL_HEIGHT)) continue;
        const text = element.textContent.trim();
        return { detected: true, isReel: SHARED_POST_BADGE_IS_REEL.test(text), label: text, href: nearestLinkHref(element), element };
    }
    return null;
}

/** @param {Element} element - a leaf whose whole text is one "@handle" */
function isAttributionCandidate(element) {
    if (element.children.length !== 0 || !element.textContent) return false;
    const text = element.textContent.trim();
    return text.startsWith('@') && text.length >= 2 && text.length <= 40 && !text.includes(' ');
}

/**
 * @param {Element[]} elements - every element of the page, in document order
 * @returns {SharedPostDetection | null} an "@author" attribution under a re-shared feed card
 */
function findOriginalAuthorAttribution(elements) {
    for (const element of elements) {
        if (isExtensionUi(element) || !isAttributionCandidate(element)) continue;
        if (!isRenderedVisible(element) || !isInStoryColumn(element, STORY_BODY_HEIGHT)) continue;
        const clickable = element.closest('[role="button"], button, a, div[tabindex]') || element;
        return { detected: true, isReel: false, label: element.textContent.trim(), href: nearestLinkHref(element), element: clickable };
    }
    return null;
}

/** @returns {SharedPostDetection} */
export function detectSharedReelOrPost() {
    const fromDictionary = sharedItemFromDictionary();
    if (fromDictionary) return fromDictionary;
    const fromLink = findSharedPostLink();
    if (fromLink) return fromLink;

    const elements = Array.from(document.querySelectorAll('*'));
    const fromPage = findSharedPostBadge(elements) || findOriginalAuthorAttribution(elements);
    if (fromPage) return fromPage;

    // Nothing shared in this story: drop the warning left over from a previous one.
    const outdatedToast = document.getElementById(SHARED_POST_WARNING_TOAST_ID);
    if (outdatedToast) outdatedToast.remove();
    return { detected: false };
}
