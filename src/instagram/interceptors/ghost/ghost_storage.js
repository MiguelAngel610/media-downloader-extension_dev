import { mdLog, logError } from '../shared/logger.js';
import { createTimedStore } from '../shared/timed_store.js';

/* Media Downloader - Ghost Storage (MAIN world)
 * Every record Ghost Mode persists in instagram.com's localStorage, declared in one place. */

const STORY_LIFETIME_MS = 24 * 60 * 60 * 1000;
const SCHEMA_KEY = 'md_ghost_storage_schema';
// v3 (28 Nov 2026): only the reel seen ledger is kept. Instagram itself resumes reels and grays rings
// from the replayed `seen`, so the slide checkpoints and the gray-ring marks were retired.
const SCHEMA_VERSION = '3';
const RETIRED_KEYS = Object.freeze(['md_ghost_seen_users', 'md_ghost_story_checkpoints', 'md_ghost_seen_schema']);

/** @typedef {{ takenAt: number, updatedAt: number }} ReelSeenEntry - taken_at (s) of the newest item opened */

/** Local replacement for the reel `seen` value the server never receives (seen_ledger.js). */
/** @type {import('../shared/timed_store.js').TimedStore<ReelSeenEntry>} */
export const reelSeenStore = createTimedStore({
    key: 'md_ghost_reel_seen',
    label: 'Seen Ledger',
    ttlMs: STORY_LIFETIME_MS,
    timestampOf: (entry) => (entry.takenAt ? entry.updatedAt : null),
});

/** Records of retired features would stay in localStorage forever: removed once. */
function migrateGhostStorage() {
    try {
        if (localStorage.getItem(SCHEMA_KEY) === SCHEMA_VERSION) return;
        const retired = RETIRED_KEYS.filter((key) => localStorage.getItem(key) !== null);
        retired.forEach((key) => localStorage.removeItem(key));
        localStorage.setItem(SCHEMA_KEY, SCHEMA_VERSION);
        if (retired.length > 0) mdLog('👻 Ghost Storage', `Removed retired records: ${retired.join(', ')}`, '#8b5cf6');
    } catch (err) {
        logError('Ghost Storage (migration)', err);
    }
}
migrateGhostStorage();
