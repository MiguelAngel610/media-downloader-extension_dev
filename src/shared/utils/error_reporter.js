/* Media Downloader - Error Reporter (content scripts, ISOLATED world)
 * Zero Silent Errors without flooding the console: many guarded spots run inside
 * requestAnimationFrame loops or DOM scans, so each distinct (context, message)
 * pair is logged once per page. Loaded first in every content-script group. */

(() => {
    const MAX_DISTINCT_ERRORS = 200;
    /** @type {Set<string>} */
    const reportedKeys = new Set();

    /**
     * @param {string} context - where it happened, e.g. "IG Feed Progress: border radius"
     * @param {unknown} error
     */
    function reportError(context, error) {
        const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
        const key = `${context}|${message}`;
        if (reportedKeys.has(key) || reportedKeys.size >= MAX_DISTINCT_ERRORS) return;
        reportedKeys.add(key);
        console.warn(`[Media Downloader] ${context}:`, error);
    }

    window.MDErrorReporter = Object.freeze({ reportError });
})();
