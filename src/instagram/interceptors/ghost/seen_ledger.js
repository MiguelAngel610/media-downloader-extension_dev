import { toUnixSeconds } from '../shared/time_utils.js';
import { normalizeUsername } from '../shared/username.js';
import { reelSeenStore } from './ghost_storage.js';

/* Media Downloader - Local Seen Ledger (MAIN world)
 * Ghost Mode blocks Instagram's seen request, so the server never learns how far each reel was watched.
 * The ledger keeps, per story owner, the taken_at of the newest item actually opened: the value
 * Instagram would have stored as the reel's `seen`. native_seen.js replays it into every reel payload. */

/**
 * Remembers that `username`'s reel was watched up to the item taken at `takenAt` (never moves back).
 * @param {unknown} username
 * @param {unknown} takenAt - seconds, milliseconds or microseconds
 * @returns {boolean} true when the ledger moved forward
 */
export function recordLocalSeen(username, takenAt) {
    const owner = normalizeUsername(username);
    const seconds = toUnixSeconds(takenAt);
    if (!owner || !seconds) return false;
    let advanced = false;
    reelSeenStore.update((ledger) => {
        if (ledger[owner] && ledger[owner].takenAt >= seconds) return false;
        ledger[owner] = { takenAt: seconds, updatedAt: Date.now() };
        advanced = true;
        return true;
    });
    return advanced;
}

/**
 * One read of the whole ledger, meant to be reused while walking a single payload.
 * @returns {Map<string, number>} lowercase owner → taken_at (Unix seconds) of the newest item watched
 */
export function readLocalSeenSnapshot() {
    const snapshot = new Map();
    const ledger = reelSeenStore.read();
    for (const owner in ledger) snapshot.set(owner, ledger[owner].takenAt);
    return snapshot;
}

/**
 * @param {Map<string, number>} snapshot - from readLocalSeenSnapshot()
 * @param {unknown} username
 * @returns {number | null}
 */
export function localSeenOf(snapshot, username) {
    const owner = normalizeUsername(username);
    return owner ? snapshot.get(owner) ?? null : null;
}
