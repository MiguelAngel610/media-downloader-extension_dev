/* Media Downloader for X - Main init: interceptor injection, message handling, observer */

console.log("Media Downloader for X Loaded");

// Inject the interceptor script to access window.fetch and window.XMLHttpRequest
const script = document.createElement('script');
script.src = chrome.runtime.getURL('src/x/interceptors/x_interceptor.js');
script.onload = function() { this.remove(); };
(document.head || document.documentElement).appendChild(script);

// Listen for messages from the button
window.addEventListener("message", (event) => {
    if (event.source !== window || !event.data) return;

    // Video result from interceptor
    if (event.data.action === "X_VIDEO_RESULT") {
        const tweetId = event.data.tweetId;
        const videoUrl = event.data.videoUrl;

        if (videoUrl) {
            const tweetDate = event.data.tweetDate;
            const fileName = window.FilenameFormatter.format(tweetDate, tweetId, 'mp4');
            console.log(`Downloading X video (Tweet: ${tweetId}):`, videoUrl);
            chrome.runtime.sendMessage({
                action: "browser_download",
                url: videoUrl,
                filename: fileName
            }, (response) => {
                if (response && response.success) {
                    console.log("Video download started:", response.downloadId);
                } else {
                    console.error("Video download failed:", response);
                }
            });
        } else {
            alert("Video URL not captured yet. Please play the video for a second and try again!");
        }
    }

    if (event.data.action === "DOWNLOAD_X_IMAGE") {
        const imgUrl = event.data.url;
        const tweetId = event.data.tweetId;
        const tweetDate = event.data.tweetDate;
        const prefix = tweetDate ? `${tweetDate}_` : '';
        console.log(`Downloading X image (Tweet: ${tweetId}):`, imgUrl);

        fetch(imgUrl)
            .then(res => {
                if (!res.ok) throw new Error("Fetch failed: " + res.status);
                return res.blob();
            })
            .then(blob => {
                const ext = blob.type.split("/")[1] || "jpg";
                // Add random suffix to prevent collisions for multiple images in a single tweet
                const fileName = window.FilenameFormatter.format(tweetDate, tweetId, ext, window.FilenameFormatter.randomSuffix());
                const blobUrl = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = blobUrl;
                a.download = fileName;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(blobUrl);
                console.log("Image downloaded:", fileName);
            })
            .catch(err => {
                console.error("Image download failed:", err);
                // Fallback: background download
                chrome.runtime.sendMessage({
                    action: "queue_download",
                    url: window.location.href,
                    account: "twitter_user",
                    mediaType: "photo",
                    platform: "twitter",
                    direct_metadata: {
                        url: imgUrl,
                        is_direct: true,
                        ext: "jpg",
                        tweet_id: tweetId,
                        tweet_date: tweetDate
                    }
                });
            });
    }
});

// Run injector on mutations
let injectTimeout = null;
function debouncedInject() {
    if (injectTimeout) return;
    injectTimeout = setTimeout(() => {
        injectDownloadButtons();
        injectTimeout = null;
    }, 300);
}

function initX() {
    if (!document.body) {
        setTimeout(initX, 100);
        return;
    }

    // Set up MDObserverManager to re-run on DOM changes
    if (window.MDObserverManager) {
        window.MDObserverManager.observeDOM(() => {
            debouncedInject();
        });
    } else {
        setInterval(() => {
            debouncedInject();
        }, 1000);
    }

    // Initial run
    setTimeout(injectDownloadButtons, 2000);
}

// Global keyboard shortcut (via ShortcutManager)
if (window.ShortcutManager) {
    window.ShortcutManager.onShortcutPressed(() => {
        // Find best button
        let bestBtn = null;
        
        // 1. Try modal first (photo viewer or video player)
        const dialogs = document.querySelectorAll('[role="dialog"]');
        for (const dialog of dialogs) {
            const btn = dialog.querySelector('.md-download-btn-x');
            if (btn && window.getComputedStyle(dialog).display !== 'none') {
                bestBtn = btn;
                break;
            }
        }
        
        // 2. If no modal, find centered article on timeline
        if (!bestBtn) {
            const articles = document.querySelectorAll('article[role="article"]');
            let minDistance = Infinity;
            const centerY = window.innerHeight / 2;
            
            for (const article of articles) {
                const btn = article.querySelector('.md-download-btn-x');
                if (!btn) continue;
                
                const rect = article.getBoundingClientRect();
                if (rect.bottom < 0 || rect.top > window.innerHeight) continue;
                
                const articleCenterY = rect.top + (rect.height / 2);
                const distance = Math.abs(articleCenterY - centerY);
                
                if (distance < minDistance) {
                    minDistance = distance;
                    bestBtn = btn;
                }
            }
        }
        
        // 3. Click it!
        if (bestBtn) {
            bestBtn.click();
            
            // Visual feedback for shortcut
            const overlay = bestBtn.querySelector('.r-1p0dtai') || bestBtn.querySelector('.r-zchlnj');
            if (overlay) {
                const oldBg = overlay.style.backgroundColor;
                overlay.style.backgroundColor = 'rgba(29, 155, 240, 0.3)';
                setTimeout(() => { overlay.style.backgroundColor = oldBg; }, 300);
            }
        }
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initX);
} else {
    initX();
}
