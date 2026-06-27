/* Media Downloader for X - Main init: interceptor injection, message handling, observer */

console.log("Media Downloader for X Loaded");

// Inject the interceptor script to access window.fetch and window.XMLHttpRequest
const script = document.createElement('script');
script.src = chrome.runtime.getURL('x_interceptor.js');
script.onload = function() { this.remove(); };
(document.head || document.documentElement).appendChild(script);

// Listen for video result from the interceptor
window.addEventListener("message", (event) => {
    if (event.source !== window || !event.data || event.data.action !== "X_VIDEO_RESULT") return;

    const tweetId = event.data.tweetId;
    const videoUrl = event.data.videoUrl;

    if (videoUrl) {
        console.log(`Sending download request for X video (Tweet: ${tweetId}):`, videoUrl);
        chrome.runtime.sendMessage({
            action: "queue_download",
            url: window.location.href,
            account: "twitter_user",
            mediaType: "video",
            platform: "twitter",
            direct_metadata: {
                url: videoUrl,
                is_direct: true,
                ext: "mp4",
                tweet_id: tweetId
            }
        }, (response) => {
            console.log("Download queued:", response);
        });
    } else {
        alert("Video URL not captured yet. Please play the video for a second and try again!");
    }
});

// Run injector on mutations
function initX() {
    if (!document.body) {
        setTimeout(initX, 100);
        return;
    }

    const observer = new MutationObserver((mutations) => {
        injectDownloadButtons();
    });

    observer.observe(document.body, { childList: true, subtree: true });

    // Initial run
    setTimeout(injectDownloadButtons, 2000);
}

initX();
