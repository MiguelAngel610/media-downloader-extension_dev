import { mdLog } from './logger.js';

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
    } catch (e) {
        return {};
    }
}

export function saveStoryCheckpoint(username, slideIndex, total = 0) {
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

export function getCurrentStoryUsername() {
    try {
        let path = window.location.pathname;
        let match = path.match(/^\/stories\/([a-zA-Z0-9_.-]+)/);
        if (!match) return null;
        let u = match[1].toLowerCase().trim();
        if (['highlights', 'direct', 'explore'].includes(u)) return null;
        return u;
    } catch (e) {
        return null;
    }
}

export function getStorySegmentInfo() {
    // Method 1: Check our custom counter element from video_progress.js (e.g. "2/5", "5/5", "1/1")
    let counter = document.querySelector('#md-story-counter');
    if (counter && counter.textContent && counter.textContent.includes('/')) {
        let parts = counter.textContent.split('/');
        let cur = parseInt(parts[0], 10);
        let total = parseInt(parts[1], 10);
        if (!isNaN(cur) && !isNaN(total) && total > 0) {
            return { isLast: cur >= total, cur, total };
        }
    }

    // Method 2: Check native segment bars at the top of the story viewer
    let allDivs = document.querySelectorAll('div');
    for (let d of allDivs) {
        if (d.children.length === 0 || d.children.length > 150) continue;
        let rect = d.getBoundingClientRect();
        if (rect.width > 100 && rect.top >= -20 && rect.top < 150 && rect.height > 0 && rect.height <= 35) {
            let style = window.getComputedStyle(d);
            if (style.display === 'flex' || style.display === 'grid') {
                let firstChild = d.children[0];
                if (firstChild && firstChild.id !== 'md-story-progress-container') {
                    let cr = firstChild.getBoundingClientRect();
                    if (cr.height > 0 && cr.height <= 20 && cr.width >= 1) {
                        let segs = Array.from(d.children).filter(c => c.id !== 'md-story-progress-container');
                        let total = segs.length;
                        if (total > 1) {
                            for (let i = 0; i < total - 1; i++) {
                                let s = segs[i];
                                let inner = s.querySelector('div, span');
                                if (inner) {
                                    let pRect = s.getBoundingClientRect();
                                    let iRect = inner.getBoundingClientRect();
                                    // If an earlier segment is less than 95% full or actively animating, we are NOT on the last segment
                                    if (pRect.width > 0 && (iRect.width / pRect.width) < 0.95) {
                                        return { isLast: false, cur: i + 1, total };
                                    }
                                }
                            }
                        }
                        return { isLast: true, cur: total, total };
                    }
                }
            }
        }
    }

    return { isLast: true, cur: 1, total: 1 };
}

function findNextStoryButton() {
    let labeled = document.querySelector('button[aria-label="Next"], button[aria-label="Siguiente"], [role="button"][aria-label="Next"], [role="button"][aria-label="Siguiente"]');
    if (labeled && labeled.getBoundingClientRect().width > 0) return labeled;

    let svg = document.querySelector('svg[aria-label="Next"], svg[aria-label="Siguiente"]');
    if (svg) {
        let btn = svg.closest('button, [role="button"]');
        if (btn && btn.getBoundingClientRect().width > 0) return btn;
    }

    let allBtns = document.querySelectorAll('button, div[role="button"]');
    for (let b of allBtns) {
        let r = b.getBoundingClientRect();
        if (r.width > 20 && r.height > 20 && r.left > window.innerWidth / 2 && r.top > 100 && r.top < window.innerHeight - 100) {
            let s = b.querySelector('svg');
            if (s && !b.querySelector('img') && !b.classList.contains('md-native-btn')) {
                return b;
            }
        }
    }
    return null;
}

export function triggerNextStorySlide(useButtonFallback = false) {
    let keyEvtDown = new KeyboardEvent('keydown', {
        key: 'ArrowRight',
        code: 'ArrowRight',
        keyCode: 39,
        which: 39,
        bubbles: true,
        cancelable: true,
        composed: true,
        view: window
    });
    let keyEvtUp = new KeyboardEvent('keyup', {
        key: 'ArrowRight',
        code: 'ArrowRight',
        keyCode: 39,
        which: 39,
        bubbles: true,
        cancelable: true,
        composed: true,
        view: window
    });

    let target = document.activeElement || document.body || document;
    target.dispatchEvent(keyEvtDown);
    target.dispatchEvent(keyEvtUp);
    window.dispatchEvent(keyEvtDown);
    window.dispatchEvent(keyEvtUp);

    if (useButtonFallback) {
        let nextBtn = findNextStoryButton();
        if (nextBtn) {
            try { nextBtn.click(); } catch (e) {}
        }
    }
}

let resumeInProgress = false;
let currentActiveUsername = null;
let lastSavedSlide = {};

function executeSlideAdvance(username, targetSlide, initialSeg) {
    let target = Math.min(targetSlide, initialSeg.total);
    if (initialSeg.cur >= target) {
        resumeInProgress = false;
        return;
    }

    let stepsMax = target - initialSeg.cur;
    let stepCount = 0;
    let consecutiveSameSlide = 0;
    let lastSeenSlide = initialSeg.cur;

    let advanceInterval = setInterval(() => {
        if (getCurrentStoryUsername() !== username) {
            clearInterval(advanceInterval);
            resumeInProgress = false;
            return;
        }

        let curSeg = getStorySegmentInfo();
        if (curSeg.cur >= target || stepCount >= stepsMax + 2) {
            clearInterval(advanceInterval);
            resumeInProgress = false;
            mdLog("🔄 Story Resume", `Successfully resumed @${username} to slide ${curSeg.cur}/${curSeg.total}`, "#8b5cf6");
            return;
        }

        if (curSeg.cur === lastSeenSlide) {
            consecutiveSameSlide++;
        } else {
            consecutiveSameSlide = 0;
            lastSeenSlide = curSeg.cur;
        }

        triggerNextStorySlide(consecutiveSameSlide > 1);
        stepCount++;
    }, 60);
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
    const maxAttempts = 30; // Max 1.5 seconds

    let mountCheckInterval = setInterval(() => {
        attempts++;
        if (getCurrentStoryUsername() !== username) {
            clearInterval(mountCheckInterval);
            resumeInProgress = false;
            return;
        }

        let segInfo = getStorySegmentInfo();
        if (segInfo.total > 1) {
            clearInterval(mountCheckInterval);
            executeSlideAdvance(username, targetSlide, segInfo);
            return;
        }

        if (attempts >= maxAttempts) {
            clearInterval(mountCheckInterval);
            resumeInProgress = false;
        }
    }, 50);
}

function checkAndSaveProgress(username) {
    if (resumeInProgress) return;

    let segInfo = getStorySegmentInfo();
    if (!segInfo || segInfo.total <= 1) return;

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
