/**
 * @fileoverview Viewport checks shared by the Instagram content script: horizontal distance to the
 * screen centre (the active story/post is the centred one) and style visibility.
 */

/**
 * @param {{ left: number, width: number }} rect
 * @returns {number} horizontal distance in px from the rect centre to the viewport centre
 */
export function horizontalOffsetFromCenter(rect) {
    return Math.abs(rect.left + rect.width / 2 - window.innerWidth / 2);
}

/**
 * Sorts in place, closest to the horizontal centre first (stable for equal distances).
 * @template {Element} T
 * @param {T[]} elements
 * @returns {T[]} the same array
 */
export function sortByHorizontalCenter(elements) {
    return elements.sort((a, b) => horizontalOffsetFromCenter(a.getBoundingClientRect()) - horizontalOffsetFromCenter(b.getBoundingClientRect()));
}

/** @param {Element} element */
export function isStyleVisible(element) {
    const style = window.getComputedStyle(element);
    return style.opacity !== '0' && style.visibility !== 'hidden' && style.display !== 'none';
}
