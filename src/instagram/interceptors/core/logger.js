// globals and logger
window.__md_vanishMode = false;
window.__md_ghostOnline = false;
window.__md_ghostSeen = false;

function mdLog(badge, message, badgeColor = "#3b82f6") {
    console.log(
        `%c ${badge} %c ${message} `,
        `background: ${badgeColor}; color: #ffffff; font-weight: 700; font-size: 11px; border-radius: 4px 0 0 4px; padding: 2px 6px; font-family: 'Inter', system-ui, -apple-system, sans-serif;`,
        `background: #1e293b; color: #f8fafc; font-size: 11px; border-radius: 0 4px 4px 0; padding: 2px 8px; font-family: 'Inter', system-ui, -apple-system, sans-serif; font-weight: 500; border: 1px solid #334155; border-left: none;`
    );
}

// Funciones globales para recolectar URLs de 1080p en la memoria
window.__md_pfps_list = window.__md_pfps_list || new Set();

window.__md_sniffPfps = function(text) {
    if (!text || typeof text !== 'string') return;
    try {
        let regex = /"profile_pic_url_hd":"([^"]+)"/g;
        let match;
        while ((match = regex.exec(text)) !== null) {
            let url = match[1].replace(/\\u0026/g, '&').replace(/\\\//g, '/');
            window.__md_pfps_list.add(url);
        }
    } catch(e) {}
};

