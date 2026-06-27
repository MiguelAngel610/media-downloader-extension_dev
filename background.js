const NATIVE_HOST = "com.media.downloader";

let downloadQueue = [];
let isProcessing = false;

// Listen for messages from content.js or popup.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "queue_download") {
        downloadQueue.push(request);
        sendResponse({ status: "queued" });
        processQueue();
        return true;
    } else if (request.action === "browser_download") {
        chrome.downloads.download({
            url: request.url,
            filename: request.filename || "download.jpeg",
            conflictAction: "uniquify"
        }, (downloadId) => {
            if (chrome.runtime.lastError) {
                sendResponse({ success: false, error: chrome.runtime.lastError.message });
            } else {
                sendResponse({ success: true, downloadId: downloadId });
            }
        });
        return true;
    } else if (request.action === "fetch_mobile_api") {
        fetch(`https://i.instagram.com/api/v1/users/${request.userId}/info/`, {
            credentials: "include",
            headers: {
                'x-ig-app-id': '936619743392459'
            }
        })
        .then(res => res.json())
        .then(data => sendResponse({ success: true, data: data }))
        .catch(err => sendResponse({ success: false, error: err.toString() }));
        return true;
    }
});

function processQueue() {
    if (isProcessing || downloadQueue.length === 0) return;
    
    isProcessing = true;
    const request = downloadQueue.shift();
    
    sendToNativeHost(request, (response) => {
        // Move to next in queue regardless of success/fail
        isProcessing = false;
        processQueue();
    });
}

function sendToNativeHost(request, sendResponse) {
    console.log(`Sending to host: ${request.url} using account ${request.account} with mediaType ${request.mediaType}`);
    
    try {
        let message = { 
            url: request.url, 
            account: request.account, 
            mediaType: request.mediaType,
            platform: request.platform || "auto",
            direct_metadata: request.direct_metadata || null
        };
        chrome.runtime.sendNativeMessage(
            NATIVE_HOST,
            message,
            function(response) {
                if (chrome.runtime.lastError) {
                    console.error("Native Messaging Error:", chrome.runtime.lastError.message);
                    sendResponse({ status: "error", message: chrome.runtime.lastError.message });
                } else {
                    console.log("Received from host:", response);
                    sendResponse(response);
                }
            }
        );
    } catch (e) {
        console.error("Failed to connect to native host:", e);
        sendResponse({ status: "error", message: e.toString() });
    }
}
