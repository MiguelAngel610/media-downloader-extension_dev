import { mdLog, logError } from './logger.js';
import { clearStoryCheckpoint, saveStoryCheckpoint, getStorySegmentInfo } from './story_resume.js';

/* Media Downloader - Ghost Mode (MAIN world)
 * Visual feedback and "seen in stealth" bookkeeping.
 * Request classification lives in ghost_policy.js, interception in network.js
 * and the flags in ghost_settings.js. */

/** @typedef {import('./ghost_policy.js').GhostBlockType} GhostBlockType */

const SEEN_USERS_STORAGE_KEY = 'md_ghost_seen_users';
const SEEN_TTL_MS = 24 * 60 * 60 * 1000; // Instagram story lifetime
const BLOCK_FEEDBACK_COOLDOWN_MS = 2000;

/** @returns {Record<string, number | { seenAt: number }>} */
function readSeenUsers() {
    try {
        return JSON.parse(localStorage.getItem(SEEN_USERS_STORAGE_KEY) || '{}');
    } catch (err) {
        logError('Ghost Seen Store', err);
        return {};
    }
}

/** @param {Record<string, number | { seenAt: number }>} seenUsers */
function writeSeenUsers(seenUsers) {
    try {
        localStorage.setItem(SEEN_USERS_STORAGE_KEY, JSON.stringify(seenUsers));
    } catch (err) {
        logError('Ghost Seen Store', err);
    }
}

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

window.__md_applyGhostVisuals = function () {
    const seenUsers = readSeenUsers();

    const now = Date.now();
    let updated = false;
    for (const u in seenUsers) {
        const entry = seenUsers[u];
        const seenTime = typeof entry === 'object' ? entry.seenAt : entry;
        if (now - seenTime > SEEN_TTL_MS) {
            delete seenUsers[u];
            updated = true;
        }
    }
    if (updated) writeSeenUsers(seenUsers);

    const users = Object.keys(seenUsers);

    // At document_start <head> may not exist yet.
    const styleParent = document.head || document.documentElement;
    if (!styleParent) return;

    let styleEl = document.getElementById('md-ghost-styles');
    if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = 'md-ghost-styles';
        styleParent.appendChild(styleEl);
    }

    if (users.length === 0) {
        styleEl.textContent = '';
        return;
    }

    const cssRules = users.map((u) => {
        const uLower = u.toLowerCase();
        return `
        a[href*="/stories/${u}/"] canvas,
        a[href*="/stories/${u}/"] svg:not([aria-label]),
        :is([role="button"], button, li, header):has(img[alt*="${uLower}"]):not(:has(video)) canvas,
        :is([role="button"], button, li, header):has(img[alt*="${uLower}"]):not(:has(video)) svg:not([aria-label]),
        :is([role="button"], button, li):has(:is([title="${uLower}"], span, div):is([title="${uLower}"])):not(:has(video)) canvas,
        :is([role="button"], button, li):has(:is([title="${uLower}"], span, div):is([title="${uLower}"])):not(:has(video)) svg:not([aria-label]) {
            filter: grayscale(100%) contrast(0) brightness(1.6) !important;
            opacity: 0.2 !important;
            transition: all 0.5s ease;
        }
        `;
    });

    const css = cssRules.join('\n');
    if (styleEl.textContent !== css) {
        styleEl.textContent = css;
    }

    // Direct DOM inline pass for 100% reliable gray ring across all layouts and languages
    document.querySelectorAll('img[alt]').forEach((img) => {
        const alt = (img.getAttribute('alt') || '').toLowerCase();
        for (const u of users) {
            const uLower = u.toLowerCase();
            const match = alt === uLower ||
                alt.includes(` ${uLower} `) ||
                alt.endsWith(` ${uLower}`) ||
                alt.endsWith(` ${uLower}.`) ||
                alt.includes(`de ${uLower}`) ||
                alt.includes(`${uLower}'s`) ||
                alt.includes(uLower);
            if (!match) continue;
            const container = img.closest('[role="button"], button, li, header, a') || img.parentElement;
            if (!container) continue;
            container.querySelectorAll('canvas, svg:not([aria-label])').forEach((ring) => {
                ring.style.setProperty('filter', 'grayscale(100%) contrast(0) brightness(1.6)', 'important');
                ring.style.setProperty('opacity', '0.2', 'important');
            });
        }
    });
};

/** Runs the visual pass, isolating failures so the interval keeps working. */
function safeApplyGhostVisuals() {
    try {
        window.__md_applyGhostVisuals();
    } catch (err) {
        logError('Ghost Visuals', err);
    }
}

// Periodic visual sync for single page application navigation and scroll
setInterval(safeApplyGhostVisuals, 1000);
window.addEventListener('popstate', () => {
    setTimeout(safeApplyGhostVisuals, 150);
});

/** @param {string | null} [networkUsername] */
window.__md_markStoryAsGhostSeen = function (networkUsername = null) {
    if (window.__md_resumeInProgress) return; // Do not touch checkpoints or update seen state while auto-advancing slides
    let username = networkUsername;
    if (!username) {
        const match = window.location.href.match(/\/stories\/([^\/]+)\//);
        if (!match) return;
        username = match[1];
    }

    const segInfo = getStorySegmentInfo();
    const cur = segInfo && segInfo.cur ? segInfo.cur : 1;
    const total = segInfo && segInfo.total ? segInfo.total : 1;
    const isLast = segInfo && segInfo.isLast !== undefined ? segInfo.isLast : (total <= 1 || cur >= total);

    // Mark as ghost-seen immediately
    const seenUsers = readSeenUsers();
    seenUsers[username] = Date.now();
    writeSeenUsers(seenUsers);

    // Manage checkpoint: if partially viewed, save position; if finished, clear
    if (!isLast && cur > 1 && cur < total) {
        saveStoryCheckpoint(username, cur, total);
    } else if (isLast) {
        clearStoryCheckpoint(username);
    }

    // Notify content script to save in extension storage
    window.postMessage({ type: 'MD_GHOST_HISTORY_ADD', username: username, timestamp: Date.now() }, '/');

    safeApplyGhostVisuals();
    mdLog("👻 Story Viewed in Stealth", `@${username} marked as ghost-seen (${cur}/${total}) — Ring turned gray`, "#8b5cf6");
};

let lastGhostBlockFeedbackAt = 0;

/**
 * Called by network.js whenever a story/DM seen request is blocked.
 * @param {GhostBlockType | null} type
 * @param {string | null} [networkUsername]
 */
export function handleGhostBlock(type, networkUsername = null) {
    if (type === 'story') {
        window.__md_markStoryAsGhostSeen(networkUsername);
    }
    // Instagram retries blocked mutations; rate-limit the feedback to avoid console spam.
    const now = Date.now();
    if (now - lastGhostBlockFeedbackAt > BLOCK_FEEDBACK_COOLDOWN_MS) {
        mdLog(type === 'story' ? "👻 Story Shield" : "💬 DM Shield", `Blocked outgoing request to mark ${type} as seen`, "#f59e0b");
        showGhostToast(type === 'story' ? "👻" : "👀", "#0f172a");
        lastGhostBlockFeedbackAt = now;
    }
}
