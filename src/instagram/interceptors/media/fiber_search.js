/**
 * @fileoverview Fiber search entry point (MAIN world).
 * Answers MD_REQUEST_FIBER from the content script: given the clicked <video>/<img> (tagged with
 * data-md-id), finds its best media URL / DASH manifest, owner, date, shortcode and carousel index.
 *
 * Phases (each only runs if the previous one left gaps):
 *   1. walk the element's fiber chain, then the enclosing article/dialog chain (fiber/props_search.js)
 *   2. shallow scan of DOM-attached React props up the ancestors   (fiber/dom_props_search.js)
 *   3. look the media id up in server-rendered data                  (fiber/initial_data_search.js)
 */
import { logError } from '../shared/logger.js';
import { searchProps } from './fiber/props_search.js';
import { searchDomProps } from './fiber/dom_props_search.js';
import { searchInitialData } from './fiber/initial_data_search.js';
import { createSearchState, hasDashWithIdentity, hasIdentity, hasMediaWithIdentity, toResultMessage } from './fiber/search_state.js';

/** @typedef {import('./fiber/search_state.js').FiberSearchState} FiberSearchState */

const REQUEST_TYPE = 'MD_REQUEST_FIBER';

// React's fiber tree follows the component hierarchy (not the DOM), so walking up from the
// clicked <video>/<img> reaches the component that owns THIS post's data.
const FIBER_KEY_PREFIXES = ['__reactFiber$', '__reactInternalInstance$'];
const MAX_FIBER_STEPS = 200;

/**
 * @param {Element | null} element
 * @returns {Record<string, any> | null} the fiber node React attached to a DOM element
 */
function getFiber(element) {
    if (!element) return null;
    const key = Object.keys(element).find((name) => FIBER_KEY_PREFIXES.some((prefix) => name.startsWith(prefix)));
    return key ? element[key] : null;
}

/**
 * Calls `visit` for each ancestor fiber (bounded) until it returns true.
 * @param {Record<string, any> | null} startFiber
 * @param {(fiber: Record<string, any>) => boolean} visit - return true to stop
 */
function walkUpFibers(startFiber, visit) {
    let fiber = startFiber;
    for (let steps = 0; fiber && steps < MAX_FIBER_STEPS; steps++) {
        if (visit(fiber)) return;
        fiber = fiber.return;
    }
}

/**
 * @param {Record<string, any>} props
 * @param {FiberSearchState} state
 */
function searchRoot(props, state) {
    if (props && typeof props === 'object') searchProps(props, 0, new Set(), state);
}

/**
 * @param {Element} element
 * @param {FiberSearchState} state
 */
function searchElementFibers(element, state) {
    walkUpFibers(getFiber(element), (fiber) => {
        searchRoot(fiber.memoizedProps, state);
        if (fiber.pendingProps !== fiber.memoizedProps) searchRoot(fiber.pendingProps, state);
        return hasMediaWithIdentity(state);
    });
}

/**
 * Absolutely positioned videos and portals are not connected to the post's data:
 * the enclosing article/dialog owns the owner and date (and the carousel to match the slide).
 * @param {Element} element
 * @param {FiberSearchState} state
 */
function searchArticleFibers(element, state) {
    const article = element.closest('article, [role="dialog"]');
    if (!article) return;
    walkUpFibers(getFiber(article), (fiber) => {
        searchRoot(fiber.memoizedProps, state);
        return hasIdentity(state);
    });
}

/**
 * @param {Element} element
 * @param {{ shortcode?: string, posterSig?: string, carouselIndex?: number }} request
 * @returns {FiberSearchState}
 */
function runSearch(element, request) {
    const state = createSearchState(request);
    searchElementFibers(element, state);
    if (!hasIdentity(state)) searchArticleFibers(element, state);
    if (!hasDashWithIdentity(state) && !state.url) searchDomProps(element, state, request.shortcode);
    if (!state.dash && !state.url && state.id) searchInitialData(state);
    return state;
}

window.addEventListener('message', (event) => {
    // Only our own window may request a fiber walk (rejects openers/iframes; also avoids a TypeError on null data).
    if (event.source !== window || !event.data || event.data.type !== REQUEST_TYPE) return;
    const request = event.data;
    try {
        const element = document.querySelector(`[data-md-id="${request.id}"]`);
        if (!element) throw new Error(`media element ${request.id} not found`);
        window.postMessage(toResultMessage(runSearch(element, request), request.id), '/');
    } catch (err) {
        logError('Fiber: request', err); // error boundary: the content script must always get an answer
        window.postMessage({ type: 'MD_FIBER_RESULT', id: request.id, error: true }, '/');
    }
});
