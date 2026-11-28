import { mdLog, logErrorOnce } from '../shared/logger.js';
import { formatLocalTime } from '../shared/time_utils.js';
import { localSeenOf, readLocalSeenSnapshot } from './seen_ledger.js';

/* Media Downloader - Native Seen Replay (MAIN world)
 * Instagram picks where a reel opens (the first item newer than reel.seen) and whether its ring is gray
 * (latest_reel_media <= seen) from the `seen` field of the reels it downloads. Raising that field to the
 * local ledger before Instagram reads the payload restores the native behavior under Ghost Mode: it
 * opens on the next unwatched story by itself, with no synthetic clicks and no visible fast-forward.
 * Instagram decodes its payloads (XHR text, fetch text/json, server-rendered JSON) with JSON.parse,
 * so that is the hook point; Response.prototype.json is routed through it too.
 * Must load before any Instagram script (manifest "world": "MAIN", "run_at": "document_start"). */

const REEL_PAYLOAD_MARKER = '"latest_reel_media"';
const MAX_WALK_DEPTH = 64;

/** Logs each owner/value once: Instagram re-parses the same reels many times per session. */
const loggedReplays = new Set();

/**
 * A story reel carries both fields. User objects (latest_reel_media only) are not reels, and
 * highlights keep their own seen state: the ledger only describes the 24 h story reel.
 * @param {Record<string, any>} record
 * @returns {boolean}
 */
function isReel(record) {
    return 'latest_reel_media' in record && 'seen' in record;
}

/** @param {Record<string, any>} reel @returns {boolean} */
function isHighlightReel(reel) {
    return String(reel.id || '').startsWith('highlight:') || /highlight/i.test(String(reel.reel_type || ''));
}

/** @param {Record<string, any>} reel @returns {string | null} */
function reelOwner(reel) {
    const user = reel.user || reel.owner;
    return user && typeof user.username === 'string' ? user.username : null;
}

/**
 * @param {Record<string, any>} reel
 * @param {Map<string, number>} snapshot
 * @returns {boolean} true when `seen` was raised
 */
function raiseReelSeen(reel, snapshot) {
    if (isHighlightReel(reel)) return false;
    const owner = reelOwner(reel);
    const localSeen = localSeenOf(snapshot, owner);
    const serverSeen = Number(reel.seen) || 0;
    if (!localSeen || localSeen <= serverSeen) return false;
    reel.seen = localSeen;
    const logKey = `${owner}:${localSeen}`;
    if (!loggedReplays.has(logKey)) {
        loggedReplays.add(logKey);
        mdLog('👁️ Native Seen', `@${owner} reel opens after the story taken at ${formatLocalTime(localSeen)} (server seen: ${serverSeen ? formatLocalTime(serverSeen) : 'none'})`, '#8b5cf6');
    }
    return true;
}

/**
 * Raises `seen` on every story reel inside a decoded Instagram payload, in place.
 * @param {unknown} root
 * @param {Map<string, number>} snapshot - from readLocalSeenSnapshot(), read once per payload
 * @returns {number} how many reels were raised
 */
export function applyLocalSeen(root, snapshot) {
    let raised = 0;
    /** @param {unknown} node @param {number} depth */
    const visit = (node, depth) => {
        if (!node || typeof node !== 'object' || depth > MAX_WALK_DEPTH) return;
        if (Array.isArray(node)) {
            for (const child of node) visit(child, depth + 1);
            return;
        }
        const record = /** @type {Record<string, any>} */ (node);
        if (isReel(record)) {
            // A reel's items never contain other reels: no need to walk them (most of the payload).
            if (raiseReelSeen(record, snapshot)) raised++;
            return;
        }
        for (const key in record) {
            const child = record[key];
            if (child && typeof child === 'object') visit(child, depth + 1);
        }
    };
    visit(root, 0);
    return raised;
}

const nativeJsonParse = JSON.parse;

/**
 * Same contract as JSON.parse (same result, same exceptions); reel payloads come back with the local seen.
 * @param {string} text
 * @param {(this: any, key: string, value: any) => any} [reviver]
 */
function parseWithLocalSeen(text, reviver) {
    const result = nativeJsonParse(text, reviver);
    if (typeof text !== 'string' || !text.includes(REEL_PAYLOAD_MARKER)) return result;
    try {
        const snapshot = readLocalSeenSnapshot();
        if (snapshot.size > 0) applyLocalSeen(result, snapshot);
    } catch (err) {
        // A failed replay must never break Instagram's own parsing: the payload is returned as is.
        logErrorOnce('Native Seen (replay)', err);
    }
    return result;
}

JSON.parse = parseWithLocalSeen;

if (typeof Response !== 'undefined' && typeof Response.prototype.json === 'function') {
    // Native json() parses internally and would bypass the JSON.parse hook.
    Response.prototype.json = function json() {
        return this.text().then((text) => JSON.parse(text));
    };
}
