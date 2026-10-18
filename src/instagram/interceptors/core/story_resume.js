import { mdLog } from './logger.js';

/* Media Downloader - Story Resume Guard: Prevents Ghost Mode from forcing stories to restart at slide 1 */

const CHECKPOINT_STORAGE_KEY = 'md_ghost_story_checkpoints';
const MAX_CHECKPOINT_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours (Instagram story TTL)

export function getStoryCheckpoints() {
    try {
        let raw = localStorage.getItem(CHECKPOINT_STORAGE_KEY);
        if (!raw) return {};
        let parsed = JSON.parse(raw);
        let now = Date.now();
        let changed = false;
        for (let u in parsed) {
            if (!parsed[u] || !parsed[u].ts || (now - parsed[u].ts > MAX_CHECKPOINT_AGE_MS)) {
                delete parsed[u];
                changed = true;
            }
        }
        if (changed) {
            localStorage.setItem(CHECKPOINT_STORAGE_KEY, JSON.stringify(parsed));
        }
        return parsed;
    } catch (e) {
        return {};
    }
}

export function saveStoryCheckpoint(username, storyId) {
    if (!username || !storyId || !isGhostModeActive()) return;
    let cleanUser = username.toLowerCase().trim();
    if (['highlights', 'direct', 'explore'].includes(cleanUser)) return;

    try {
        let checkpoints = getStoryCheckpoints();
        checkpoints[cleanUser] = {
            storyId: String(storyId),
            ts: Date.now()
        };
        localStorage.setItem(CHECKPOINT_STORAGE_KEY, JSON.stringify(checkpoints));
    } catch (e) {}
}

export function clearStoryCheckpoint(username) {
    if (!username) return;
    let cleanUser = username.toLowerCase().trim();
    try {
        let checkpoints = getStoryCheckpoints();
        if (checkpoints[cleanUser]) {
            delete checkpoints[cleanUser];
            localStorage.setItem(CHECKPOINT_STORAGE_KEY, JSON.stringify(checkpoints));
        }
    } catch (e) {}
}

export function isGhostModeActive() {
    return !!(window.__md_vanishMode || window.__md_ghostSeen);
}

export function getResolvedStoryUrl(targetUrl) {
    if (!isGhostModeActive() || !targetUrl || typeof targetUrl !== 'string') return null;

    try {
        let path = targetUrl;
        if (path.startsWith('http://') || path.startsWith('https://')) {
            let parsed = new URL(path);
            if (!parsed.hostname.includes('instagram.com')) return null;
            path = parsed.pathname + parsed.search;
        }

        // Match generic /stories/<username>/ without a specific story ID at the end
        let match = path.match(/^\/stories\/([a-zA-Z0-9_.-]+)\/?(?:\?(.*))?$/);
        if (!match) return null;

        let username = match[1].toLowerCase().trim();
        if (['highlights', 'direct', 'explore'].includes(username)) return null;

        let checkpoints = getStoryCheckpoints();
        let cp = checkpoints[username];
        if (cp && cp.storyId) {
            let query = match[2] ? `?${match[2]}` : '';
            return `/stories/${match[1]}/${cp.storyId}/${query}`;
        }
    } catch (e) {}
    return null;
}

function checkCurrentUrlForCheckpoint() {
    if (!isGhostModeActive()) return;
    try {
        let match = window.location.pathname.match(/^\/stories\/([a-zA-Z0-9_.-]+)\/(\d+)\/?/);
        if (match) {
            saveStoryCheckpoint(match[1], match[2]);
        }
    } catch (e) {}
}

function rewriteAnchor(anchor) {
    if (!anchor || !isGhostModeActive()) return;
    let href = anchor.getAttribute('href') || anchor.href;
    let resolved = getResolvedStoryUrl(href);
    if (resolved) {
        anchor.setAttribute('href', resolved);
        anchor.href = resolved;
    }
}

// Intercept browser history API to redirect generic /stories/<username>/ calls directly to last checkpoint
const originalPushState = history.pushState;
history.pushState = function(state, title, url) {
    let resolved = getResolvedStoryUrl(url);
    if (resolved) {
        mdLog("🔄 Story Resume", `Reopening at checkpoint: ${resolved}`, "#8b5cf6");
        url = resolved;
    }
    let result = originalPushState.call(this, state, title, url);
    checkCurrentUrlForCheckpoint();
    return result;
};

const originalReplaceState = history.replaceState;
history.replaceState = function(state, title, url) {
    let resolved = getResolvedStoryUrl(url);
    if (resolved) {
        url = resolved;
    }
    let result = originalReplaceState.call(this, state, title, url);
    checkCurrentUrlForCheckpoint();
    return result;
};

window.addEventListener('popstate', checkCurrentUrlForCheckpoint);

// Pre-click and hover link rewriting for story tray anchors
document.addEventListener('pointerenter', (e) => {
    let a = e.target && e.target.closest && e.target.closest('a[href*="/stories/"]');
    if (a) rewriteAnchor(a);
}, true);

document.addEventListener('pointerdown', (e) => {
    let a = e.target && e.target.closest && e.target.closest('a[href*="/stories/"]');
    if (a) rewriteAnchor(a);
}, true);

document.addEventListener('click', (e) => {
    let a = e.target && e.target.closest && e.target.closest('a[href*="/stories/"]');
    if (a) rewriteAnchor(a);
}, true);
