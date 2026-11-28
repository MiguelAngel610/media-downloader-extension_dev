import { logErrorOnce } from './logger.js';

/* Media Downloader - Timed Store (MAIN world)
 * A JSON object in the page's localStorage whose entries expire. Parsing, pruning, writing and
 * error reporting live here once, so every persisted ghost record behaves the same way. */

/**
 * @template T
 * @typedef {Object} TimedStore
 * @property {() => Record<string, T>} read - Live entries (expired ones are pruned and persisted)
 * @property {(records: Record<string, T>) => void} write
 * @property {(mutate: (records: Record<string, T>) => boolean) => void} update - Writes only when `mutate` returns true
 */

/**
 * @template T
 * @param {{ key: string, label: string, ttlMs: number, timestampOf: (entry: T) => number | null | undefined }} options
 *   `timestampOf` returns the entry's reference time in ms; a missing time counts as expired.
 * @returns {TimedStore<T>}
 */
export function createTimedStore({ key, label, ttlMs, timestampOf }) {
    /** @param {Record<string, T>} records */
    function write(records) {
        try {
            localStorage.setItem(key, JSON.stringify(records));
        } catch (err) {
            logErrorOnce(`${label} (write)`, err);
        }
    }

    /** @returns {Record<string, T>} */
    function read() {
        /** @type {Record<string, T>} */
        let records = {};
        try {
            records = JSON.parse(localStorage.getItem(key) || '{}') || {};
        } catch (err) {
            logErrorOnce(`${label} (read)`, err);
        }
        const now = Date.now();
        let pruned = false;
        for (const id in records) {
            const timestamp = records[id] ? timestampOf(records[id]) : null;
            if (!timestamp || now - timestamp > ttlMs) {
                delete records[id];
                pruned = true;
            }
        }
        if (pruned) write(records);
        return records;
    }

    /** @param {(records: Record<string, T>) => boolean} mutate */
    function update(mutate) {
        const records = read();
        if (mutate(records)) write(records);
    }

    return { read, write, update };
}
