import { mdLog } from '../shared/logger.js';
import { formatLocalTime } from '../shared/time_utils.js';
import { normalizeUsername } from '../shared/username.js';
import { recordLocalSeen } from './seen_ledger.js';

/* Media Downloader - Ghost Mode (MAIN world)
 * What happens after a seen request is blocked: the opened story goes into the local seen ledger
 * (native_seen.js replays it, so Instagram itself resumes and grays rings), the popup's stealth
 * history is notified and the user gets feedback. Request classification lives in ghost_policy.js,
 * interception in network.js, the flags in ghost_settings.js and persisted records in ghost_storage.js. */

/** @typedef {import('./ghost_policy.js').GhostBlockType} GhostBlockType */
/** @typedef {import('./ghost_policy.js').SeenItem} SeenItem */

const BLOCK_FEEDBACK_COOLDOWN_MS = 2000;
/** `/stories/<segment>/` paths that are sections, not story owners. */
const NON_OWNER_STORY_SEGMENTS = Object.freeze(['highlights', 'direct', 'explore']);

/**
 * @param {string} icon
 * @param {string} color
 */
export function showGhostToast(icon, color) {
    const btn = document.getElementById('md-floating-btn');
    if (!btn) return;
    const oldHtml = btn.innerHTML;
    const oldBg = btn.style.background;
    btn.innerHTML = `<span style="font-size:16px;">${icon}</span>`;
    btn.style.background = color;
    setTimeout(() => {
        btn.innerHTML = oldHtml;
        btn.style.background = oldBg;
    }, 1500);
}

/** @returns {string | null} owner of the story on screen, from /stories/<username>/ */
function currentStoryOwner() {
    const match = window.location.pathname.match(/^\/stories\/([a-zA-Z0-9_.-]+)/);
    const owner = match ? normalizeUsername(match[1]) : null;
    return owner && !NON_OWNER_STORY_SEGMENTS.includes(owner) ? owner : null;
}

/**
 * The request's own reelMediaTakenAt wins over the dictionary. The owner comes from the payload first,
 * then the dictionary, and the URL last: the payload names the exact story that was opened.
 * @param {string | null} networkUsername
 * @param {SeenItem | null} seenItem
 * @returns {{ owner: string | null, takenAt: unknown }}
 */
function resolveBlockedStory(networkUsername, seenItem) {
    const media = seenItem && seenItem.mediaId && window.__md_storyMedia ? window.__md_storyMedia[seenItem.mediaId] : null;
    return {
        owner: normalizeUsername(networkUsername) || normalizeUsername(media && media.username) || currentStoryOwner(),
        takenAt: (seenItem && seenItem.takenAt) || (media && media.timestamp),
    };
}

/**
 * @param {string | null} networkUsername
 * @param {SeenItem | null} seenItem
 */
function recordBlockedStorySeen(networkUsername, seenItem) {
    const { owner, takenAt } = resolveBlockedStory(networkUsername, seenItem);
    if (!owner) return;
    if (recordLocalSeen(owner, takenAt)) {
        mdLog('👁️ Native Seen', `@${owner} watched up to the story taken at ${formatLocalTime(takenAt)}`, '#8b5cf6');
    }
    // The popup's stealth history records every view; '/' restricts delivery to this origin.
    window.postMessage({ type: 'MD_GHOST_HISTORY_ADD', username: owner, timestamp: Date.now() }, '/');
}

let lastGhostBlockFeedbackAt = 0;

/**
 * Called by network.js whenever a story/DM seen request is blocked.
 * @param {GhostBlockType | null} type
 * @param {string | null} [networkUsername]
 * @param {SeenItem | null} [seenItem]
 */
export function handleGhostBlock(type, networkUsername = null, seenItem = null) {
    if (type === 'story') recordBlockedStorySeen(networkUsername, seenItem);
    // Instagram retries blocked mutations; rate-limit the feedback to avoid console spam.
    const now = Date.now();
    if (now - lastGhostBlockFeedbackAt > BLOCK_FEEDBACK_COOLDOWN_MS) {
        mdLog(type === 'story' ? "👻 Story Shield" : "💬 DM Shield", `Blocked outgoing request to mark ${type} as seen`, "#f59e0b");
        showGhostToast(type === 'story' ? "👻" : "👀", "#0f172a");
        lastGhostBlockFeedbackAt = now;
    }
}
