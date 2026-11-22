/**
 * @fileoverview React fiber tree access (MAIN world).
 * The fiber tree follows React's component hierarchy (not the DOM), so walking up from the
 * clicked <video>/<img> reaches the component that owns THIS post's data. */

const FIBER_KEY_PREFIXES = ['__reactFiber$', '__reactInternalInstance$'];
const MAX_FIBER_STEPS = 200;

/**
 * @param {Element | null} element
 * @returns {Record<string, any> | null} the fiber node React attached to a DOM element
 */
export function getFiber(element) {
    if (!element) return null;
    const key = Object.keys(element).find((name) => FIBER_KEY_PREFIXES.some((prefix) => name.startsWith(prefix)));
    return key ? element[key] : null;
}

/**
 * Calls `visit` for each ancestor fiber (bounded) until it returns true.
 * @param {Record<string, any> | null} startFiber
 * @param {(fiber: Record<string, any>) => boolean} visit - return true to stop
 */
export function walkUpFibers(startFiber, visit) {
    let fiber = startFiber;
    for (let steps = 0; fiber && steps < MAX_FIBER_STEPS; steps++) {
        if (visit(fiber)) return;
        fiber = fiber.return;
    }
}
