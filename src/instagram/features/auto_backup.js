let isAutoBackingUp = false;
let backupUsername = null;
let backupCuenta = "M";
let downloadedMediaIds = new Set();
let autoScrollInterval = null;

// Ask background if this tab is for backup
chrome.runtime.sendMessage({ action: "check_backup_status" }, (response) => {
    if (response && response.isBackingUp && response.username) {
        backupCuenta = response.cuenta || "M";
        startBackupProcess(response.username);
    }
});

function startBackupProcess(username) {
    isAutoBackingUp = true;
    backupUsername = username;
    console.log(`[Backup] Started for ${username}`);
    chrome.runtime.sendMessage({ action: "backup_log", message: `[Backup] Opened profile for @${username}. Fetching PFP...` });
    
    // Wait for the profile header to load (poll every 500ms up to 10 seconds)
    let checks = 0;
    let waitForLoad = setInterval(() => {
        let headerLoaded = document.querySelector('header');
        if (headerLoaded || checks > 20) {
            clearInterval(waitForLoad);
            setTimeout(finishPostsAndReels, 500); // Give it half a second to render the img tag
        }
        checks++;
    }, 500);
}

async function finishPostsAndReels() {
    if (autoScrollInterval) clearInterval(autoScrollInterval);
    
    let profilePic = document.querySelector('header img[alt*="profile picture"], header img[alt*="foto de perfil"]');
    let src = profilePic ? (profilePic.src || profilePic.currentSrc) : null;
    
    if (!src) {
        console.warn("MD PFP (Backup) Warning: No PFP found to download.");
        setTimeout(processStoriesAndHighlights, 2000);
        return;
    }

    // THE IN-MEMORY ZOOM TRICK
    console.log("MD PFP (Backup): Activating Zoom spoofing...");
    
    let hdUrl = src;
    
    if (hdUrl.includes('150x150')) {
        let zoomData = await new Promise(resolve => {
            let originalSrc = profilePic.src || profilePic.currentSrc;
            
            window.postMessage({ type: 'MD_SPOOF_ZOOM' }, '*');
            
            let checks = 0;
            let checkInterval = setInterval(() => {
                checks++;
                let currentSrc = profilePic.src || profilePic.currentSrc;
                let currentSrcset = profilePic.getAttribute('srcset') || "";
                
                let foundHd = null;
                if (currentSrc !== originalSrc && !currentSrc.includes('150x150')) {
                    foundHd = currentSrc;
                } else if (currentSrcset.includes('1080')) {
                    let urlsInSrcset = currentSrcset.match(/https:\/\/[^\s]+/g) || [];
                    for (let u of urlsInSrcset) {
                        if (u.endsWith(',')) u = u.slice(0, -1);
                        if (!u.includes('150x150') && !u.includes('320x320')) {
                            foundHd = u;
                        }
                    }
                }
                
                if (foundHd || checks > 40) { // Max 4 seconds
                    clearInterval(checkInterval);
                    window.postMessage({ type: 'MD_RESTORE_ZOOM' }, '*');
                    resolve(foundHd);
                }
            }, 100);
        });
        
        if (zoomData && !zoomData.includes('150x150')) {
            hdUrl = zoomData;
        }
    }

    if (hdUrl.includes('150x150')) {
        console.warn("MD PFP (Backup): Fallo extracción 1080p. Usando miniatura.");
    }

    chrome.runtime.sendMessage({ action: "get_cdn_timestamp", url: hdUrl }, (res) => {
        let finalTimestamp = (res && res.timestamp) ? res.timestamp : Math.floor(Date.now() / 1000);
        
        chrome.runtime.sendMessage({
            action: "queue_download",
            url: hdUrl,
            account: backupCuenta,
            direct_metadata: {
                username: backupUsername,
                shortcode: "profile_pic",
                media_category: "pfp",
                is_video: false,
                is_backup: true,
                timestamp: finalTimestamp
            },
            mediaType: "direct_story",
            platform: "instagram"
        });
        
        setTimeout(processStoriesAndHighlights, 2000);
    });
}

function processStoriesAndHighlights() {
    chrome.runtime.sendMessage({ action: "backup_log", message: `[Backup] Fetching Stories...` });
    
    // Click Main Story Ring
    let storyRing = document.querySelector('header canvas');
    if (!storyRing) storyRing = document.querySelector('header img');
    
    if (storyRing) {
        storyRing.click();
        chrome.runtime.sendMessage({ action: "backup_log", message: `[Backup] Story ring clicked. Waiting for Vanish.js to intercept...` });
    }
    
    // Close story viewer after 4 seconds
    setTimeout(() => {
        closeStoryViewer();
        
        // Process Highlights after closing main story
        setTimeout(processNextHighlight, 2000);
    }, 4000);
}

let currentHighlightIndex = 0;
let highlightItems = [];

function closeStoryViewer() {
    let closeBtn = document.querySelector('svg[aria-label="Close"], svg[aria-label="Cerrar"]');
    if (closeBtn) {
        let btn = closeBtn.closest('div[role="button"]');
        if (btn) btn.click();
    } else {
        // Fallback: Sometimes the close button is an SVG path without an aria-label, try to click the top right corner
        let closeSvg = document.querySelector('polyline[points="20.643 3.357 12 12 3.353 20.647"]');
        if (closeSvg) {
            let btn2 = closeSvg.closest('div[role="button"]');
            if (btn2) btn2.click();
        }
    }
}

function processNextHighlight() {
    if (currentHighlightIndex === 0) {
        chrome.runtime.sendMessage({ action: "backup_log", message: `[Backup] Discovering Highlights...` });
        
        // Find Highlights
        // Usually they are in a UL list inside a section below the bio
        let possibleHighlightImgs = Array.from(document.querySelectorAll('ul li img'));
        // Filter out those that are too small or not highlights (highlights are usually inside a button/link)
        highlightItems = possibleHighlightImgs.filter(img => {
            return img.width > 40 && img.closest('div[role="button"], a');
        });
        
        // SPEED OPTIMIZATION: Only check the first 5 highlights.
        // Instagram sorts highlights by last updated date descending.
        // If a highlight was updated in the last 7 days, it will be at the very front.
        if (highlightItems.length > 5) {
            highlightItems = highlightItems.slice(0, 5);
        }
        
        if (highlightItems.length === 0) {
            chrome.runtime.sendMessage({ action: "backup_log", message: `[Backup] No highlights found.` });
            return finishBackup();
        }
        chrome.runtime.sendMessage({ action: "backup_log", message: `[Backup] Found ${highlightItems.length} Highlights. Processing sequentially...` });
    }
    
    if (currentHighlightIndex >= highlightItems.length) {
        chrome.runtime.sendMessage({ action: "backup_log", message: `[Backup] All Highlights processed.` });
        return finishBackup();
    }
    
    let hlImg = highlightItems[currentHighlightIndex];
    let hlBtn = hlImg.closest('div[role="button"], a');
    if (hlBtn) {
        hlBtn.click();
        chrome.runtime.sendMessage({ action: "backup_log", message: `[Backup] Clicked Highlight ${currentHighlightIndex + 1}/${highlightItems.length}` });
    }
    
    currentHighlightIndex++;
    
    // Close highlight and move to next
    setTimeout(() => {
        closeStoryViewer();
        setTimeout(processNextHighlight, 1500);
    }, 3500);
}

function finishBackup() {
    chrome.runtime.sendMessage({ action: "backup_log", message: `[Backup] Done! Closing tab for @${backupUsername}.` });
    setTimeout(() => {
        chrome.runtime.sendMessage({ action: "backup_user_done", username: backupUsername });
    }, 2000);
}

window.addEventListener('message', function(event) {
    if (!isAutoBackingUp || event.source !== window || !event.data) return;
    
    if (event.data.type === 'MD_STORY_MEDIA_UPDATE') {
        let mediaDict = event.data.media;
        let count = 0;
        let skippedOld = 0;
        const sevenDaysAgo = (Date.now() / 1000) - (7 * 24 * 3600);
        
        for (const [id, item] of Object.entries(mediaDict)) {
            if (downloadedMediaIds.has(id)) continue;
            
            let url = typeof item === 'string' ? item : item.url;
            let timestamp = item.timestamp || (Date.now() / 1000);
            let mediaUsername = item.username || "";
            
            // SECURITY FILTER STRICT: Instagram prefetches other users' stories/reels and suggested posts.
            // Ignore any media that does not explicitly match the backup username.
            if (!mediaUsername || mediaUsername.toLowerCase() !== backupUsername.toLowerCase()) {
                downloadedMediaIds.add(id);
                continue;
            }
            
            if (timestamp < sevenDaysAgo) {
                skippedOld++;
                downloadedMediaIds.add(id);
                continue;
            }
            
            if (typeof url === 'string') {
                downloadedMediaIds.add(id);
                count++;
                
                // Queue download using direct mode so host.py handles it
                chrome.runtime.sendMessage({
                    action: "queue_download",
                    url: url,
                    account: backupCuenta,
                    mediaType: "direct_story",
                    platform: "instagram",
                    direct_metadata: { 
                        username: backupUsername,
                        is_backup: true,
                        is_video: item.is_video,
                        media_category: "story",
                        timestamp: timestamp,
                        media_id: id
                    }
                });
            }
        }
        
        if (count > 0 || skippedOld > 0) {
            chrome.runtime.sendMessage({ action: "backup_log", message: `[Backup] Found ${count} new HD URLs (Skipped ${skippedOld} older than 7 days).` });
        }
    }
});
