document.addEventListener('DOMContentLoaded', () => {
    const downloadBtn = document.getElementById('download-btn');
    const urlInput = document.getElementById('url-input');
    const statusMsg = document.getElementById('status-message');
    const accountSelect = document.getElementById('account-select');

    // Load saved account preference and vanish mode
    chrome.storage.local.get(['selectedAccount', 'vanishMode', 'ghostOnline', 'ghostSeen'], function(result) {
        if (result.selectedAccount) {
            accountSelect.value = result.selectedAccount;
        }
        if (result.vanishMode) {
            const toggle = document.getElementById('vanish-toggle');
            toggle.checked = true;
            toggle.nextElementSibling.style.backgroundColor = '#10b981'; // Green
        }
        if (result.ghostOnline) {
            const toggle = document.getElementById('ghost-online-toggle');
            toggle.checked = true;
            toggle.nextElementSibling.style.backgroundColor = '#10b981';
        }
        if (result.ghostSeen) {
            const toggle = document.getElementById('ghost-seen-toggle');
            toggle.checked = true;
            toggle.nextElementSibling.style.backgroundColor = '#10b981';
        }
    });

    // Save preferences when changed
    accountSelect.addEventListener('change', () => {
        chrome.storage.local.set({selectedAccount: accountSelect.value});
    });

    const vanishToggle = document.getElementById('vanish-toggle');
    vanishToggle.addEventListener('change', (e) => {
        chrome.storage.local.set({vanishMode: e.target.checked});
        updateToggleStyle(e.target);
    });

    const ghostOnlineToggle = document.getElementById('ghost-online-toggle');
    ghostOnlineToggle.addEventListener('change', (e) => {
        chrome.storage.local.set({ghostOnline: e.target.checked});
        updateToggleStyle(e.target);
        notifyTabs({type: 'MD_UPDATE_SETTINGS', ghostOnline: e.target.checked});
    });

    const ghostSeenToggle = document.getElementById('ghost-seen-toggle');
    ghostSeenToggle.addEventListener('change', (e) => {
        chrome.storage.local.set({ghostSeen: e.target.checked});
        updateToggleStyle(e.target);
        notifyTabs({type: 'MD_UPDATE_SETTINGS', ghostSeen: e.target.checked});
    });

    function updateToggleStyle(target) {
        target.nextElementSibling.style.backgroundColor = target.checked ? '#10b981' : '#ccc';
        const dot = target.nextElementSibling.querySelector('.slider-dot');
        if (dot) {
            dot.style.transform = target.checked ? 'translateX(14px)' : 'translateX(0)';
        }
    }

    function notifyTabs(msg) {
        chrome.tabs.query({url: "*://*.instagram.com/*"}, function(tabs) {
            for (let tab of tabs) {
                chrome.tabs.sendMessage(tab.id, msg).catch(() => {});
            }
        });
    }

    // Also update dot initially
    chrome.storage.local.get(['vanishMode', 'ghostOnline', 'ghostSeen'], function(result) {
        if (result.vanishMode) {
            const dot = document.getElementById('vanish-toggle').nextElementSibling.querySelector('.slider-dot');
            if (dot) dot.style.transform = 'translateX(14px)';
        }
        if (result.ghostOnline) {
            const dot = document.getElementById('ghost-online-toggle').nextElementSibling.querySelector('.slider-dot');
            if (dot) dot.style.transform = 'translateX(14px)';
        }
        if (result.ghostSeen) {
            const dot = document.getElementById('ghost-seen-toggle').nextElementSibling.querySelector('.slider-dot');
            if (dot) dot.style.transform = 'translateX(14px)';
        }
    });

    // Automatically fill URL if we are on a supported site
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        let currentUrl = tabs[0].url;
        if (currentUrl.includes("instagram.com") || currentUrl.includes("facebook.com") || currentUrl.includes("twitter.com") || currentUrl.includes("x.com")) {
            urlInput.value = currentUrl;
        }
    });

    function showStatus(msg, type) {
        statusMsg.textContent = msg;
        statusMsg.className = `status ${type}`;
    }

    downloadBtn.addEventListener('click', () => {
        const url = urlInput.value.trim();
        if (!url) {
            showStatus("Please enter a valid URL.", "error");
            return;
        }

        downloadBtn.disabled = true;
        downloadBtn.innerHTML = `
            <svg class="spinner" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation: spin 1s linear infinite;"><line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line></svg>
            Processing...
        `;

        chrome.runtime.sendMessage({
            action: "download",
            url: url,
            mediaType: "auto",
            platform: "auto",
            account: accountSelect.value
        }, (response) => {
            downloadBtn.disabled = false;
            downloadBtn.innerHTML = `
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                Download Media
            `;

            if (chrome.runtime.lastError || !response || response.status === "error") {
                showStatus(response?.message || "Error connecting to Native Host. Is it installed?", "error");
            } else if (response.status === "skipped") {
                showStatus("Already got it! File exists.", "success");
            } else {
                showStatus("Download started successfully!", "success");
            }
        });
    });
});

// Add spin keyframe dynamically
const style = document.createElement('style');
style.innerHTML = `
@keyframes spin {
    100% { transform: rotate(360deg); }
}
`;
document.head.appendChild(style);
