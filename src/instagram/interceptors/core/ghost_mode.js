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
