import { mdLog, logErrorOnce } from '../shared/logger.js';

/* Media Downloader - Story Resume Guard: Prevents Ghost Mode from forcing stories to restart at slide 1 */

const CHECKPOINT_STORAGE_KEY = 'md_ghost_story_checkpoints';
const MAX_CHECKPOINT_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours (Instagram story TTL)

export function isGhostModeActive() {
    return !!(window.__md_vanishMode || window.__md_ghostSeen);
}

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
    } catch (err) {
        logErrorOnce('Story Checkpoint (read)', err);
        return {};
    }
}

export function saveStoryCheckpoint(username, slideIndex, total = 0) {
    if (resumeInProgress || window.__md_resumeInProgress) return;
    if (!username || !slideIndex || !isGhostModeActive()) return;
    let cleanUser = username.toLowerCase().trim();
    if (['highlights', 'direct', 'explore'].includes(cleanUser)) return;

    let slideNum = parseInt(slideIndex, 10);
    let totalNum = parseInt(total, 10);
    if (isNaN(slideNum) || slideNum <= 1) return;

    // If user has reached the final slide, checkpoint is no longer needed
    if (totalNum > 0 && slideNum >= totalNum) {
        clearStoryCheckpoint(cleanUser);
        return;
    }

    try {
        let checkpoints = getStoryCheckpoints();
        checkpoints[cleanUser] = {
            slideIndex: slideNum,
            total: totalNum || 0,
            ts: Date.now()
        };
        localStorage.setItem(CHECKPOINT_STORAGE_KEY, JSON.stringify(checkpoints));
    } catch (err) { logErrorOnce('Story Checkpoint (save)', err); }
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
    } catch (err) { logErrorOnce('Story Checkpoint (clear)', err); }
}

export function getCurrentStoryUsername() {
    try {
        let path = window.location.pathname;
        let match = path.match(/^\/stories\/([a-zA-Z0-9_.-]+)/);
        if (!match) return null;
        let u = match[1].toLowerCase().trim();
        if (['highlights', 'direct', 'explore'].includes(u)) return null;
        return u;
    } catch (err) {
        logErrorOnce('Story Resume: current username', err);
        return null;
    }
}

function measureSegment(seg) {
    if (!seg) return 0;
    let parentRect = seg.getBoundingClientRect();
    if (parentRect.width === 0) return 0;
    let minPct = 100;
    let nodes = [seg, ...Array.from(seg.querySelectorAll('div, span'))];
    for (let n of nodes) {
        let nRect = n.getBoundingClientRect();
        if (nRect.height > 0 && nRect.height <= 25 && nRect.width <= parentRect.width + 2) {
            let overlapLeft = Math.max(nRect.left, parentRect.left);
            let overlapRight = Math.min(nRect.right, parentRect.right);
            let visibleWidth = Math.max(0, overlapRight - overlapLeft);
            let pct = Math.max(0, Math.min(100, (visibleWidth / parentRect.width) * 100));
            if (pct < minPct) minPct = pct;
        }
    }
    return minPct;
}

export function getStorySegmentInfo() {
    // Method 1: Check our custom counter element from video_progress.js
    let counter = document.querySelector('#md-story-counter');
    if (counter && counter.dataset && counter.dataset.ready === 'true') {
        let cur = parseInt(counter.dataset.cur, 10);
        let total = parseInt(counter.dataset.total, 10);
        if (!isNaN(cur) && !isNaN(total) && total > 0) {
            return { ready: true, isLast: cur >= total, cur, total };
        }
    }

    // Method 2: Scan for native segment row inside active story container
    let storyRoot = document.querySelector('section, div[role="dialog"], main');
    if (storyRoot) {
        let potentialContainers = storyRoot.querySelectorAll('div');
        for (let d of potentialContainers) {
            if (d.id === 'md-story-progress-container' || d.closest('#md-story-progress-container')) continue;
            let ch = Array.from(d.children).filter(c => c.id !== 'md-story-progress-container');
            if (ch.length >= 1 && ch.length <= 100) {
                let first = ch[0];
                if (first.querySelector('button, img, svg, header, canvas')) continue;
                let rect = d.getBoundingClientRect();
                if (rect.width > 150 && rect.top >= -30 && rect.top < 150 && rect.height > 0 && rect.height <= 35) {
                    let total = ch.length;
                    let activeIndex = total;
                    for (let i = 0; i < total; i++) {
                        let pct = measureSegment(ch[i]);
                        if (pct < 98) {
                            activeIndex = i + 1;
                            break;
                        }
                    }
                    return { ready: true, isLast: activeIndex >= total, cur: activeIndex, total };
                }
            }
        }
    }

    // Not mounted or single story without progress bars yet
    return { ready: false, isLast: false, cur: 1, total: 0 };
}

export function triggerNextStorySlide() {
    let storyRoot = document.querySelector('section, div[role="dialog"], main');
    if (!storyRoot) return;

    let media = storyRoot.querySelector('video, img');
    let rect = (media && media.getBoundingClientRect().width > 100) 
        ? media.getBoundingClientRect() 
        : storyRoot.getBoundingClientRect();

    let clickX = rect.left + rect.width * 0.85;
    let clickY = rect.top + rect.height * 0.5;

    let targetEl = document.elementFromPoint(clickX, clickY);
    if (targetEl && !targetEl.closest('#md-story-slider, #md-floating-btn, .md-native-btn, #md-story-progress-container')) {
        ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(evtType => {
            let evt = new MouseEvent(evtType, {
                clientX: clickX,
                clientY: clickY,
                bubbles: true,
                cancelable: true,
                composed: true,
                view: window,
                buttons: (evtType.includes('down') ? 1 : 0),
                button: 0
            });
            targetEl.dispatchEvent(evt);
        });

        try { targetEl.click(); } catch (err) { logErrorOnce('Story Resume: advance click', err); }
    }

    ['keydown', 'keyup'].forEach(evtType => {
        let evt = new KeyboardEvent(evtType, {
            key: 'ArrowRight',
            code: 'ArrowRight',
            keyCode: 39,
            which: 39,
            bubbles: true,
            cancelable: true,
            composed: true,
            view: window
        });
        document.dispatchEvent(evt);
        window.dispatchEvent(evt);
        if (document.activeElement) document.activeElement.dispatchEvent(evt);
    });
}

let resumeInProgress = false;
window.__md_resumeInProgress = false;
let currentActiveUsername = null;
let lastSavedSlide = {};

function executeSlideAdvance(username, targetSlide, initialSeg) {
    let target = Math.min(targetSlide, initialSeg.total);
    if (initialSeg.cur >= target) {
        resumeInProgress = false;
        window.__md_resumeInProgress = false;
        return;
    }

    let stepsMax = target - initialSeg.cur;
    let stepCount = 0;

    resumeInProgress = true;
    window.__md_resumeInProgress = true;

    mdLog("🔄 Story Resume", `Advancing @${username} from slide ${initialSeg.cur} to ${target}...`, "#8b5cf6");

    let advanceInterval = setInterval(() => {
        if (getCurrentStoryUsername() !== username) {
            clearInterval(advanceInterval);
            resumeInProgress = false;
            window.__md_resumeInProgress = false;
            return;
        }

        let curSeg = getStorySegmentInfo();
        if (curSeg.ready && curSeg.cur >= target) {
            clearInterval(advanceInterval);
            resumeInProgress = false;
            window.__md_resumeInProgress = false;
            mdLog("🔄 Story Resume", `Successfully resumed @${username} to slide ${curSeg.cur}/${curSeg.total}`, "#8b5cf6");
            return;
        }

        if (stepCount >= stepsMax + 5) {
            clearInterval(advanceInterval);
            resumeInProgress = false;
            window.__md_resumeInProgress = false;
            mdLog("🔄 Story Resume", `Resume advance completed at slide ${curSeg.cur}/${curSeg.total}`, "#8b5cf6");
            return;
        }

        triggerNextStorySlide();
        stepCount++;
    }, 85);
}


function attemptResumeForUser(username) {
    let checkpoints = getStoryCheckpoints();
    let cp = checkpoints[username];
    if (!cp || !cp.slideIndex || cp.slideIndex <= 1) {
        return;
    }

    let targetSlide = cp.slideIndex;
    mdLog("🔄 Story Resume", `Detected checkpoint for @${username} at slide ${targetSlide}. Preparing auto-advance...`, "#8b5cf6");

    resumeInProgress = true;
    let attempts = 0;
    const maxAttempts = 40; // Max 2 seconds waiting for story segments to render

    let mountCheckInterval = setInterval(() => {
        attempts++;
        if (getCurrentStoryUsername() !== username) {
            clearInterval(mountCheckInterval);
            resumeInProgress = false;
            return;
        }

        let segInfo = getStorySegmentInfo();
        if (segInfo.ready && segInfo.total > 1) {
            clearInterval(mountCheckInterval);
            executeSlideAdvance(username, targetSlide, segInfo);
            return;
        }

        if (attempts >= maxAttempts) {
            clearInterval(mountCheckInterval);
            resumeInProgress = false;
            window.__md_resumeInProgress = false;
        }
    }, 50);
}

function checkAndSaveProgress(username) {
    if (resumeInProgress || window.__md_resumeInProgress) return;

    let segInfo = getStorySegmentInfo();
    if (!segInfo.ready || segInfo.total < 1) return;

    // Ensure user is registered as ghost-seen whenever they are actively viewing stories
    if (window.__md_markStoryAsGhostSeen && !window.__md_resumeInProgress) {
        let seenUsers = {};
        try {
            seenUsers = JSON.parse(localStorage.getItem('md_ghost_seen_users') || '{}');
        } catch (err) { logErrorOnce('Ghost Seen Store (read)', err); }
        if (!seenUsers[username]) {
            window.__md_markStoryAsGhostSeen(username);
        }
    }

    if (segInfo.isLast) {
        if (lastSavedSlide[username] !== 'CLEARED') {
            lastSavedSlide[username] = 'CLEARED';
            clearStoryCheckpoint(username);
        }
        return;
    }

    if (segInfo.cur > 1 && segInfo.cur < segInfo.total) {
        if (lastSavedSlide[username] !== segInfo.cur) {
            lastSavedSlide[username] = segInfo.cur;
            saveStoryCheckpoint(username, segInfo.cur, segInfo.total);
            mdLog("💾 Story Checkpoint", `Saved @${username} at slide ${segInfo.cur}/${segInfo.total}`, "#8b5cf6");
        }
    }
}

export function checkActiveStory() {
    if (!isGhostModeActive()) return;

    let username = getCurrentStoryUsername();
    if (!username) {
        currentActiveUsername = null;
        return;
    }

    if (currentActiveUsername !== username) {
        currentActiveUsername = username;
        attemptResumeForUser(username);
        return;
    }

    checkAndSaveProgress(username);
}

let resumeInterval = null;
export function startStoryResumeMonitor() {
    if (resumeInterval) return;
    resumeInterval = setInterval(checkActiveStory, 250);
}

startStoryResumeMonitor();
window.addEventListener('popstate', checkActiveStory);
window.addEventListener('pagehide', () => {
    let u = getCurrentStoryUsername();
    if (u) checkAndSaveProgress(u);
});
window.addEventListener('beforeunload', () => {
    let u = getCurrentStoryUsername();
    if (u) checkAndSaveProgress(u);
});
