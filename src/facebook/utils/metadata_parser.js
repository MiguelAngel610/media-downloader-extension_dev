/* Media Downloader for Facebook - Metadata Parser */

class FBMetadataParser {
    static extractFromDOM(container) {
        let metadata = {
            username: "fb_user",
            shortcode: "story",
            timestamp: Math.floor(Date.now() / 1000)
        };

        try {
            // 0. Extract Date Visually (Fallback for Facebook SPA hidden timestamps)
            let links = Array.from((container || document).querySelectorAll('a[role="link"], span')).filter(el => {
                let p = el.closest('div[data-pagelet]');
                if (p && p.getAttribute('data-pagelet')) {
                    let pagelet = p.getAttribute('data-pagelet').toLowerCase();
                    if (pagelet.includes('chat') || pagelet.includes('notification')) return false;
                }
                return true;
            });
            
            // Critical fix: Prioritize links that point to a post/photo permalink.
            // This prevents picking up dates from Messenger notifications (e.g., "4h").
            links.sort((a, b) => {
                let aHref = a.href || "";
                let bHref = b.href || "";
                let aScore = (aHref.includes('fbid=') || aHref.includes('/photo') || aHref.includes('/post') || aHref.includes('/permalink')) ? 1 : 0;
                let bScore = (bHref.includes('fbid=') || bHref.includes('/photo') || bHref.includes('/post') || bHref.includes('/permalink')) ? 1 : 0;
                return bScore - aScore;
            });
            
            for (let el of links) {
                let text = el.innerText || el.textContent;
                if (!text || text.length > 30) continue;
                
                // Match common dates: "14 h", "August 12", "Yesterday at 5:00 PM", "2 d", "2023"
                if (text.match(/(\d+\s*[hmdy])|(January|February|March|April|May|June|July|August|September|October|November|December)|(Yesterday)|(ayer|hace|min|hora|día|mes|año)/i)) {
                    let parsed = this.parseVisualDate(text);
                    if (parsed) {
                        metadata.timestamp = parsed;
                        break;
                    }
                }
            }
            // 1. Extract Username
            if (container) {
                // Prioritize h2, h3, or strong tags which are much more likely to be the author
                let textElements = Array.from(container.querySelectorAll('h2, h3, strong'));
                // Append links as fallback
                textElements = textElements.concat(Array.from(container.querySelectorAll('a[role="link"]')));
                
                for (let el of textElements) {
                    let text = el.innerText || el.textContent;
                    if (text && text.trim().length > 0 && text.trim().length < 50) {
                        let lower = text.toLowerCase().trim();
                        // Extended blocklist to prevent picking up UI buttons
                        let blocklist = [
                            'like', 'comment', 'share', 'me gusta', 'comentar', 'compartir',
                            'view post', 'ver publicación', 'ver foto', 'view photo',
                            'close', 'cerrar', 'next', 'siguiente', 'previous', 'anterior',
                            'send message', 'enviar mensaje', 'follow', 'seguir',
                            'message', 'mensaje', 'reply', 'responder'
                        ];
                        
                        let isBlocked = false;
                        for (let word of blocklist) {
                            if (lower.includes(word)) {
                                isBlocked = true;
                                break;
                            }
                        }
                        
                        // Try to extract the real username (handle) from the link URL instead of the display name
                        let aTag = el.tagName === 'A' ? el : el.querySelector('a');
                        let foundHandle = null;
                        
                        if (aTag && aTag.href) {
                            try {
                                let urlObj = new URL(aTag.href, window.location.origin);
                                let path = urlObj.pathname.replace(/\/$/, ''); // remove trailing slash
                                
                                if (path === '/profile.php') {
                                    // Skip numeric IDs, fallback to display name instead
                                } else {
                                    let parts = path.split('/');
                                    // Ensure it's likely a user profile path and NOT a numeric ID
                                    if (parts.length > 1 && !['photo', 'groups', 'watch', 'stories', 'gaming', 'marketplace', 'permalink', 'events'].includes(parts[1].toLowerCase())) {
                                        if (!/^\d+$/.test(parts[1])) {
                                            foundHandle = parts[1];
                                        }
                                    }
                                }
                            } catch (e) {}
                        }
                        
                        if (foundHandle) {
                            metadata.username = foundHandle;
                        } else {
                            // Fallback to Display Name if URL extraction failed or it's a numeric ID
                            // Replace spaces with dots to match Instagram handles (e.g. "Erii Guerra" -> "erii.guerra")
                            metadata.username = text.trim().toLowerCase().replace(/\s+/g, '.').replace(/[^a-z0-9_.]/g, '');
                        }
                        
                        break;
                    }
                }
            }

            // Fallback for username via URL if it's a profile
            if (metadata.username === "fb_user") {
                const match = window.location.pathname.match(/^\/([^\/]+)/);
                if (match && !['photo', 'video', 'watch', 'story', 'stories', 'groups'].includes(match[1])) {
                    metadata.username = match[1].replace(/[^a-zA-Z0-9_.]/g, '_');
                }
            }

            // 2. Extract Shortcode (fbid or pfbid)
            const url = window.location.href;
            
            // Check for fbid= parameter (used in photo theaters)
            const urlParams = new URLSearchParams(window.location.search);
            if (urlParams.has('fbid')) {
                metadata.shortcode = urlParams.get('fbid');
            } else {
                // Check for pfbid in pathname (used in standard posts)
                const pfbidMatch = url.match(/(pfbid[a-zA-Z0-9]+)/);
                if (pfbidMatch) {
                    metadata.shortcode = pfbidMatch[1];
                } else {
                    // Check for video id /videos/123456789/
                    const vidMatch = url.match(/\/videos\/(\d+)/);
                    if (vidMatch) {
                        metadata.shortcode = vidMatch[1];
                    } else {
                        // Check for reel id
                        const reelMatch = url.match(/\/reel\/(\d+)/);
                        if (reelMatch) {
                            metadata.shortcode = reelMatch[1];
                        } else {
                            // Check for story id
                            const storyMatch = url.match(/stories\/[^\/]+\/([^\/]+)/);
                            if (storyMatch) {
                                metadata.shortcode = storyMatch[1];
                            }
                        }
                    }
                }
            }
            // 3. Extract Timestamp
            // Facebook renders dates dynamically, but the raw UNIX timestamp is often embedded 
            // inside the JSON state in <script> tags alongside the post/photo ID.
            if (metadata.shortcode && metadata.shortcode !== "story") {
                const scripts = Array.from(document.querySelectorAll('script'));
                for (let script of scripts) {
                    let text = script.textContent || "";
                    if (text.includes(metadata.shortcode) && (text.includes('"creation_time":') || text.includes('"publish_time":'))) {
                        // Extract nearby creation_time (assuming it's in the same JSON object as the fbid)
                        let regex = new RegExp(`(?:${metadata.shortcode}.*?"(?:creation_time|publish_time)":(\\d+))|(?:(?:creation_time|publish_time)":(\\d+).*?${metadata.shortcode})`);
                        let match = text.match(regex);
                        if (match) {
                            let ts = match[1] || match[2];
                            if (ts) {
                                metadata.timestamp = parseInt(ts, 10);
                                break;
                            }
                        } else {
                            // Fallback: just get the first creation_time in the script if it's strongly associated
                            let looseMatch = text.match(/"(?:creation_time|publish_time)":(\d+)/);
                            if (looseMatch) {
                                metadata.timestamp = parseInt(looseMatch[1], 10);
                            }
                        }
                    }
                }
            }
        } catch (err) {
            console.error("[FB-MD] Metadata parsing error:", err);
        }

        return metadata;
    }
    static parseVisualDate(text) {
        if (!text) return null;
        let lower = text.toLowerCase().trim();
        let now = Date.now();
        
        // Relative English times
        if (lower.includes('just now')) return Math.floor(now / 1000);
        
        let m = lower.match(/^(\d+)\s*(m|h|d|w|y|hrs?|mins?|days?|weeks?|months?|years?)$/i);
        if (m) {
            let val = parseInt(m[1]);
            let unit = m[2].toLowerCase();
            let mult = 1;
            if (unit.startsWith('m') && !unit.startsWith('mo')) mult = 60; // minutes
            else if (unit.startsWith('h')) mult = 3600; // hours
            else if (unit.startsWith('d')) mult = 86400; // days
            else if (unit.startsWith('w')) mult = 604800; // weeks
            else if (unit.startsWith('mo')) mult = 2592000; // months
            else if (unit.startsWith('y')) mult = 31536000; // years
            return Math.floor(now / 1000) - (val * mult);
        }
        
        // Relative Spanish times
        if (lower.includes('hace un momento')) return Math.floor(now / 1000);
        
        let ms = lower.match(/^hace\s+(\d+)\s+(min|h|d|semana|mes|año)/);
        if (ms) {
            let val = parseInt(ms[1]);
            let unit = ms[2];
            let mult = 1;
            if (unit.startsWith('min')) mult = 60;
            if (unit.startsWith('h')) mult = 3600;
            if (unit.startsWith('d')) mult = 86400;
            if (unit.startsWith('semana')) mult = 604800;
            if (unit.startsWith('mes')) mult = 2592000;
            if (unit.startsWith('año')) mult = 31536000;
            return Math.floor(now / 1000) - (val * mult);
        }
        
        // Exact dates (e.g. "August 12 at 4:30 PM", "12 de agosto a las 16:30")
        let cleaned = lower.replace(/at|a las|de/g, '').trim();
        
        // Try native Date.parse
        let parsed = Date.parse(cleaned);
        if (!isNaN(parsed)) {
            // Handle missing year assuming current year
            if (parsed > now) {
                let d = new Date(parsed);
                d.setFullYear(d.getFullYear() - 1);
                parsed = d.getTime();
            }
            return Math.floor(parsed / 1000);
        }
        
        return null;
    }
}

window.FBMetadataParser = FBMetadataParser;
