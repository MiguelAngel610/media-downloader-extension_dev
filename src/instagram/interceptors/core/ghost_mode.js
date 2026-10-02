import { mdLog } from './logger.js';
// --- Ghost Online: WebSocket Interceptor ---
let OriginalWebSocket = window.WebSocket;
window.WebSocket = function(url, protocols) {
    let ws = new OriginalWebSocket(url, protocols);
    let originalSend = ws.send;
    
    ws.send = function(data) {
        if (window.__md_ghostOnline) {
            try {
                let dataStr = "";
                if (typeof data === 'string') {
                    dataStr = data;
                } else if (data instanceof ArrayBuffer) {
                    dataStr = new TextDecoder("utf-8").decode(new Uint8Array(data));
                } else if (data instanceof Uint8Array) {
                    dataStr = new TextDecoder("utf-8").decode(data);
                }
                
                let lowerData = dataStr.toLowerCase();
                if (lowerData.includes('update_presence') || 
                    lowerData.includes('presence_subscribe') || 
                    lowerData.includes('foreground_state')) {
                    mdLog("🟢 Ghost Online", "Intercepted WebSocket presence packet", "#10b981");
                    return; // Drop packet
                }
            } catch (e) {}
        }
        return originalSend.apply(this, arguments);
    };
    return ws;
};



window.addEventListener('message', function(event) {
if (event.data.type === 'MD_VANISH_TOGGLE') {
        window.__md_vanishMode = event.data.enabled;
        mdLog("👻 Vanish Mode", window.__md_vanishMode ? "Enabled — Stealth protocol active" : "Disabled", window.__md_vanishMode ? "#8b5cf6" : "#64748b");
    }
    
    if (event.data.type === 'MD_GHOST_ONLINE_TOGGLE') {
        window.__md_ghostOnline = event.data.enabled;
        mdLog("🟢 Ghost Online", window.__md_ghostOnline ? "Enabled — Presence concealed" : "Disabled", window.__md_ghostOnline ? "#10b981" : "#64748b");
    }
    
    if (event.data.type === 'MD_GHOST_SEEN_TOGGLE') {
        window.__md_ghostSeen = event.data.enabled;
        mdLog("👀 Ghost Seen", window.__md_ghostSeen ? "Enabled — View status hidden" : "Disabled", window.__md_ghostSeen ? "#3b82f6" : "#64748b");
    }

    
});

export function showGhostToast(icon, color) {
    let btn = document.getElementById('md-floating-btn');
    if (btn) {
        let oldHtml = btn.innerHTML;
        let oldBg = btn.style.background;
        btn.innerHTML = `<span style="font-size:16px;">${icon}</span>`;
        btn.style.background = color;
        setTimeout(() => {
            btn.innerHTML = oldHtml;
            btn.style.background = oldBg;
        }, 1500);
    }
}

export function isPresenceRequest(url, body) {
    if (!window.__md_ghostOnline) return false;
    let urlStr = (url || "").toString().toLowerCase();
    let bodyStr = (body || "").toString().toLowerCase();

    if (urlStr.includes('/ajax/presence/reconnect.php') || 
        urlStr.includes('/api/v1/presence/') ||
        (urlStr.includes('graphql') && bodyStr.includes('update_presence'))) {
        return true;
    }
    return false;
}

export function isSeenRequest(url, body) {
    let urlStr = (url || "").toString().toLowerCase();
    let bodyStr = (body || "").toString().toLowerCase();

    let targetUsername = null;
    try {
        let bStr = typeof body === 'string' ? body : bodyStr;
        let match = bStr.match(/"(?:reel_id|media_id)"\s*:\s*"([^"]+)"/);
        if (!match) {
            try { match = decodeURIComponent(bStr).match(/"(?:reel_id|media_id)"\s*:\s*"([^"]+)"/); } catch(e) {}
        }
        if (match && match[1]) {
            let id = match[1].includes('_') ? match[1].split('_')[0] : match[1];
            if (window.__md_storyMedia && window.__md_storyMedia[id]) {
                targetUsername = window.__md_storyMedia[id].username;
            }
        }
    } catch(e) {}

    let isStorySeen = bodyStr.includes('usepolarisstoriesv3seen') ||
                      bodyStr.includes('storiesseen') ||
                      bodyStr.includes('storyseen') ||
                      bodyStr.includes('story_seen') ||
                      bodyStr.includes('xdtstoryseen') ||
                      bodyStr.includes('xdtstorylike') ||
                      bodyStr.includes('usepolarisstorylike') ||
                      bodyStr.includes('ig_reels_video_view') ||
                      bodyStr.includes('ig_story_view') ||
                      bodyStr.includes('view_seen_at') ||
                      bodyStr.includes('viewseenat') ||
                      urlStr.includes('stories/reels/seen') ||
                      urlStr.includes('v2/reels/seen') ||
                      urlStr.includes('/api/v1/media/seen') ||
                      urlStr.includes('/api/v1/stories/seen');

    let isDMSeen = bodyStr.includes('usepolarisdirectthreadmarkreadmutation') ||
                   bodyStr.includes('directthreadmarkreadmutation') ||
                   urlStr.includes('threads/broadcast/mark_seen') ||
                   (urlStr.includes('direct_v2/threads') && urlStr.includes('/seen'));

    if (window.__md_vanishMode && isStorySeen) return { blocked: true, type: 'story', username: targetUsername };
    // Extract User IDs for direct messaging marking
    if (window.__md_ghostSeen && isDMSeen) return { blocked: true, type: 'dm' };
    if (window.__md_ghostSeen && isStorySeen) return { blocked: true, type: 'story', username: targetUsername }; // Fallback

    return { blocked: false };
}

window.__md_applyGhostVisuals = function() {
    let seenUsers = {};
    try {
        seenUsers = JSON.parse(localStorage.getItem('md_ghost_seen_users') || '{}');
    } catch(e) {}
    
    let now = Date.now();
    let updated = false;
    for (let u in seenUsers) {
        let seenTime = typeof seenUsers[u] === 'object' ? seenUsers[u].seenAt : seenUsers[u];
        if (now - seenTime > 86400000) { // 24 hours
            delete seenUsers[u];
            updated = true;
        }
    }
    if (updated) localStorage.setItem('md_ghost_seen_users', JSON.stringify(seenUsers));
    
    let users = Object.keys(seenUsers);
    
    let styleEl = document.getElementById('md-ghost-styles');
    if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = 'md-ghost-styles';
        document.head.appendChild(styleEl);
    }

    if (users.length === 0) {
        styleEl.textContent = '';
        return;
    }
    
    let css = users.map(u => {
        return `
        a[href^="/stories/${u}/"] canvas,
        header :has(img:is([alt="${u}"], [alt^="${u}'s "], [alt$=" ${u}"], [alt^="${u} "])) canvas,
        [role="button"]:has(img:is([alt="${u}"], [alt^="${u}'s "], [alt$=" ${u}"], [alt^="${u} "])):not(:has(video)) canvas,
        button:has(img:is([alt="${u}"], [alt^="${u}'s "], [alt$=" ${u}"], [alt^="${u} "])):not(:has(video)) canvas { 
            filter: grayscale(100%) contrast(0) brightness(1.6) !important; 
            opacity: 0.15 !important;
            transition: all 0.5s ease;
        }
    `}).join('\n');
    
    if (styleEl.textContent !== css) {
        styleEl.textContent = css;
    }
};

function isViewingLastStorySegment() {
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
    
    // Default to true if unable to find multiple segments (single story case)
    return { isLast: true, cur: 1, total: 1 };
}

window.__md_markStoryAsGhostSeen = function(networkUsername = null) {
    let username = networkUsername;
    if (!username) {
        let match = window.location.href.match(/\/stories\/([^\/]+)\//);
        if (!match) return;
        username = match[1];
    }
    
    let segInfo = isViewingLastStorySegment();
    let seenUsers = {};
    try {
        seenUsers = JSON.parse(localStorage.getItem('md_ghost_seen_users') || '{}');
    } catch(e) {}

    // Only turn icon gray if the user has reached the final story of this author!
    if (!segInfo.isLast) {
        mdLog("👀 Story Protected", `@${username} slide (${segInfo.cur}/${segInfo.total}) viewed in stealth — Ring stays colorful`, "#3b82f6");
        if (seenUsers[username]) {
            delete seenUsers[username];
            localStorage.setItem('md_ghost_seen_users', JSON.stringify(seenUsers));
            window.__md_applyGhostVisuals();
        }
        return;
    }
    
    seenUsers[username] = Date.now();
    localStorage.setItem('md_ghost_seen_users', JSON.stringify(seenUsers));
    
    // Notify content script to save in extension storage
    window.postMessage({ type: 'MD_GHOST_HISTORY_ADD', username: username, timestamp: Date.now() }, '*');

    window.__md_applyGhostVisuals();
    mdLog("👻 Story Completed", `All stories viewed (${segInfo.cur}/${segInfo.total}) for @${username} — Ring changed to gray`, "#8b5cf6");
};

window.__md_lastGhostBlock = 0;
window.__md_handleGhostBlock = function(type, networkUsername = null) {
    let now = Date.now();
    if (type === 'story') {
        window.__md_markStoryAsGhostSeen(networkUsername);
    }
    if (now - window.__md_lastGhostBlock > 2000) {
        mdLog(type === 'story' ? "👻 Story Shield" : "💬 DM Shield", `Blocked outgoing request to mark ${type} as seen`, "#f59e0b");
        showGhostToast(type === 'story' ? "👻" : "👀", "#0f172a");
        window.__md_lastGhostBlock = now;
    }
};

// Intercept navigator.sendBeacon (used sometimes when closing tabs/navigating quickly)
const originalSendBeacon = navigator.sendBeacon;
if (originalSendBeacon) {
    navigator.sendBeacon = function (url, data) {
        let bodyStr = "";
        try {
            if (typeof data === 'string') bodyStr = data;
            else if (data instanceof Blob) bodyStr = "blob"; // Difficult to read sync, but IG usually sends JSON strings or FormData
            else if (data instanceof FormData) bodyStr = "formdata";
        } catch (e) { }

        if (isPresenceRequest(url, bodyStr)) {
            mdLog("🟢 Presence Shield", "Blocked Beacon request to broadcast presence (status offline)", "#10b981");
            showGhostToast("🟢", "#064e3b");
            return true;
        }

        let seenCheck = isSeenRequest(url, bodyStr);
        if (seenCheck.blocked) {
            window.__md_handleGhostBlock(seenCheck.type, seenCheck.username);
            return true; // Fake success
        }
        return originalSendBeacon.apply(this, arguments);
    };
}
