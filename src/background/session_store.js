/* Media Downloader - Session Store (service worker)
 * The MV3 service worker is terminated after ~30s idle (or when the native port closes),
 * wiping every global. All runtime state therefore lives in chrome.storage.session:
 * memory-backed, survives service worker restarts, cleared when the browser closes,
 * and not readable from content scripts by default. */

/** @type {Map<string, Promise<unknown>>} serializes read-modify-write cycles per key */
const sessionWriteChains = new Map();

/**
 * @template T
 * @param {string} key
 * @param {T} fallback
 * @returns {Promise<T>}
 */
async function readSession(key, fallback) {
    const stored = await chrome.storage.session.get(key);
    return stored[key] === undefined ? fallback : stored[key];
}

/**
 * Atomically updates one key. Concurrent updates in the same worker are queued so none is lost.
 * @template T
 * @param {string} key
 * @param {T} fallback
 * @param {(current: T) => T} updater - receives a private copy; returns the new value
 * @returns {Promise<T>}
 */
function updateSession(key, fallback, updater) {
    const previous = sessionWriteChains.get(key) || Promise.resolve();
    const run = async () => {
        const current = await readSession(key, fallback);
        const next = updater(structuredClone(current));
        await chrome.storage.session.set({ [key]: next });
        return next;
    };
    // Chain on both outcomes: a failed update must not block the following ones (its caller gets the error).
    const next = previous.then(run, run);
    sessionWriteChains.set(key, next);
    return next;
}

self.MDSessionStore = Object.freeze({ readSession, updateSession });
