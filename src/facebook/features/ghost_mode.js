/* Media Downloader for Facebook - Ghost Mode */

const GHOST_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:24px;height:24px; color: inherit;"><path d="M9 10h.01"/><path d="M15 10h.01"/><path d="M12 2a8 8 0 0 0-8 8v12l3-3 2.5 2.5L12 19l2.5 2.5L17 19l3 3V10a8 8 0 0 0-8-8z"/></svg>`;
const ONLINE_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:24px;height:24px; color: inherit;"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`;

function injectGhostModeToggles() {
    if (window.__md_fb_ghost_injected) return;
    
    // Facebook's top right navigation area
    const navBar = document.querySelector('div[role="navigation"]');
    if (!navBar) return;
    
    // Find the rightmost part of the nav bar, usually where the profile and Messenger icons are
    // Facebook UI uses a flex container on the right side
    let rightNav = Array.from(navBar.querySelectorAll('div')).find(el => {
        let style = window.getComputedStyle(el);
        return style.display === 'flex' && el.childElementCount >= 3;
    });

    if (!rightNav) rightNav = navBar;

    // Retrieve state
    chrome.storage.local.get(['fb_ghost_seen', 'fb_ghost_presence'], function(res) {
        let isGhostSeen = res.fb_ghost_seen === true;
        let isGhostPresence = res.fb_ghost_presence === true;

        window.postMessage({ type: 'FB_GHOST_SEEN_TOGGLE', enabled: isGhostSeen }, '*');
        window.postMessage({ type: 'FB_GHOST_PRESENCE_TOGGLE', enabled: isGhostPresence }, '*');

        const ghostContainer = document.createElement('div');
        ghostContainer.className = 'md-fb-ghost-container';
        ghostContainer.style.display = 'flex';
        ghostContainer.style.alignItems = 'center';
        ghostContainer.style.gap = '8px';
        ghostContainer.style.marginRight = '8px';

        const createToggle = (svg, label, isActive, onClick) => {
            const btn = document.createElement('div');
            btn.className = 'md-fb-ghost-btn';
            btn.innerHTML = svg;
            btn.title = label;
            Object.assign(btn.style, {
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                backgroundColor: isActive ? '#e0f2fe' : '#f0f2f5',
                color: isActive ? '#0284c7' : '#050505',
                transition: 'all 0.2s ease',
                position: 'relative'
            });

            // Hover effect
            btn.addEventListener('mouseenter', () => {
                if (!btn.hasAttribute('data-active')) btn.style.backgroundColor = '#e4e6eb';
            });
            btn.addEventListener('mouseleave', () => {
                if (!btn.hasAttribute('data-active')) btn.style.backgroundColor = '#f0f2f5';
            });

            if (isActive) btn.setAttribute('data-active', 'true');

            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                let currentlyActive = btn.hasAttribute('data-active');
                if (currentlyActive) {
                    btn.removeAttribute('data-active');
                    btn.style.backgroundColor = '#f0f2f5';
                    btn.style.color = '#050505';
                    onClick(false);
                } else {
                    btn.setAttribute('data-active', 'true');
                    btn.style.backgroundColor = '#e0f2fe';
                    btn.style.color = '#0284c7';
                    onClick(true);
                }
            });

            return btn;
        };

        const seenToggle = createToggle(GHOST_SVG, "Ghost Mode (Hide Seen in Stories & DMs)", isGhostSeen, (newState) => {
            chrome.storage.local.set({ fb_ghost_seen: newState });
            window.postMessage({ type: 'FB_GHOST_SEEN_TOGGLE', enabled: newState }, '*');
            if (window.MDToastManager) window.MDToastManager.showInfo(newState ? "👻 Ghost Mode Enabled" : "👻 Ghost Mode Disabled");
        });

        const presenceToggle = createToggle(ONLINE_SVG, "Hide 'Online' Status", isGhostPresence, (newState) => {
            chrome.storage.local.set({ fb_ghost_presence: newState });
            window.postMessage({ type: 'FB_GHOST_PRESENCE_TOGGLE', enabled: newState }, '*');
            if (window.MDToastManager) window.MDToastManager.showInfo(newState ? "🛡️ 'Online' status hidden" : "🛡️ 'Online' status visible");
        });

        ghostContainer.appendChild(seenToggle);
        ghostContainer.appendChild(presenceToggle);
        
        // Insert as first child of the right nav
        if (rightNav.firstChild) {
            rightNav.insertBefore(ghostContainer, rightNav.firstChild);
        } else {
            rightNav.appendChild(ghostContainer);
        }

        window.__md_fb_ghost_injected = true;
    });
}

// Watch for DOM changes to re-inject if Facebook navigation re-renders
if (window.MDObserverManager) {
    window.MDObserverManager.observeDOM(() => {
        if (!document.querySelector('.md-fb-ghost-container')) {
            window.__md_fb_ghost_injected = false;
            injectGhostModeToggles();
        }
    });
}

// Listen for changes from the popup
chrome.storage.onChanged.addListener(function(changes, namespace) {
    if (namespace === 'local') {
        if (changes.fb_ghost_seen !== undefined) {
            window.postMessage({ type: 'FB_GHOST_SEEN_TOGGLE', enabled: changes.fb_ghost_seen.newValue }, '*');
            let btn = document.querySelector('#fb-ghost-seen-btn'); // Need to set ID on create
        }
        if (changes.fb_ghost_presence !== undefined) {
            window.postMessage({ type: 'FB_GHOST_PRESENCE_TOGGLE', enabled: changes.fb_ghost_presence.newValue }, '*');
        }
    }
});

window.injectGhostModeToggles = injectGhostModeToggles;
