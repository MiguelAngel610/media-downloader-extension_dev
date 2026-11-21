// src/telegram/utils/metadata_parser.js
(function() {
    // Extracts the post/story date from Telegram's UI for use in filenames
    // (matching the {date:%Y-%m-%d}_... pattern already used in the user's
    // gallery-dl config for other platforms).
    //
    // Telegram's date span text varies depending on recency (English UI):
    //  - "today at 5:42 PM"
    //  - "yesterday at 5:42 PM"
    //  - "Monday at 5:42 PM"      (within the last ~6 days)
    //  - "6/27/2026"              (absolute date, older posts)
    // There is no ISO datetime hidden in any attribute (confirmed by
    // inspection) — only this human-readable text is available, so we must
    // parse it. If the text doesn't match any known pattern (e.g. the UI
    // language changes, or Telegram changes its phrasing), we deliberately
    // return null rather than guessing — callers should fall back to a
    // hash-based filename instead of silently embedding a wrong date.
    window.__md_tel_extract_post_date = (container) => {
        if (!container) return null;
        const pad = (n) => String(n).padStart(2, "0");
        const formatYMD = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

        // 0. Try direct timestamp attributes first (100% exact in any language or chat type)
        const root = container.closest(".media-viewer-whole, #MediaViewer, #StoryViewer, #stories-viewer, [role='dialog'], .Profile, .message, .Message, .bubble") || container;
        const attrEl = root.querySelector("[data-timestamp], [data-time], [data-date], time[datetime]") || root.closest("[data-timestamp], [data-time], [data-date], time[datetime]");
        if (attrEl) {
            const val = attrEl.getAttribute("data-timestamp") || attrEl.getAttribute("data-time") || attrEl.getAttribute("data-date") || attrEl.getAttribute("datetime");
            if (val) {
                let num = Number(val);
                if (!isNaN(num) && val.trim().length > 0) {
                    if (val.length <= 11) num *= 1000; // unix seconds to milliseconds
                    const d = new Date(num);
                    if (!isNaN(d.getTime()) && d.getFullYear() > 2000) return formatYMD(d);
                } else {
                    const d = new Date(val);
                    if (!isNaN(d.getTime()) && d.getFullYear() > 2000) return formatYMD(d);
                }
            }
        }

        // 1. Gather text candidate elements in PRIORITY ORDER, avoiding off-screen elements (hidden sidebars, pre-rendered slides)
        let foundTimeOnly = false;
        
        const parseDateText = (rawText) => {
            if (!rawText) return null;
            const text = rawText.replace(/\u00a0/g, " ").trim();
            if (!text) return null;

            // Absolute date: YYYY-MM-DD, YYYY.MM.DD, etc.
            const isoMatch = text.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})$/);
            if (isoMatch) return `${isoMatch[1]}-${pad(isoMatch[2])}-${pad(isoMatch[3])}`;

            // Absolute date: D/M/YYYY or M/D/YYYY
            const absMatch = text.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})$/);
            if (absMatch) {
                let p1 = parseInt(absMatch[1], 10);
                let p2 = parseInt(absMatch[2], 10);
                let y = parseInt(absMatch[3], 10);
                if (y < 100) y += 2000;

                let m, d;
                if (p1 > 12) {
                    d = p1; m = p2;
                } else if (p2 > 12) {
                    m = p1; d = p2;
                } else {
                    const now = new Date();
                    const dateAsMD = new Date(y, p1 - 1, p2);
                    const dateAsDM = new Date(y, p2 - 1, p1);

                    if (dateAsDM > now && dateAsMD <= now) {
                        m = p1; d = p2;
                    } else if (dateAsMD > now && dateAsDM <= now) {
                        m = p2; d = p1;
                    } else {
                        const lang = (document.documentElement.lang || navigator.language || "").toLowerCase();
                        const pageText = document.body ? document.body.textContent : "";
                        const isEnglish = lang.startsWith("en") || pageText.includes("Saved Messages") || pageText.includes("Search");
                        if (isEnglish && text.includes("/")) {
                            m = p1; d = p2;
                        } else {
                            m = p2; d = p1;
                        }
                    }
                }
                if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
                    return `${y}-${pad(m)}-${pad(d)}`;
                }
            }

            const monthNamesEn = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
            const monthNamesEs = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];

            // Match "15 de jul. de 2025", "15 jul 2025", "15 de julio" (must be the whole string or start of string)
            const dayMonthMatch = text.match(/^(?:\w+,\s*)?(\d{1,2})\s*(?:de\s*)?([a-záéíóú]{3,10})\.?\s*(?:(?:de|,)?\s*(\d{4}))?/i);
            if (dayMonthMatch) {
                const mStr = dayMonthMatch[2].toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").substring(0, 3);
                let mIdx = monthNamesEs.indexOf(mStr);
                if (mIdx === -1) mIdx = monthNamesEn.indexOf(mStr);
                if (mIdx !== -1) {
                    const day = pad(parseInt(dayMonthMatch[1], 10));
                    const year = dayMonthMatch[3] || new Date().getFullYear();
                    return `${year}-${pad(mIdx + 1)}-${day}`;
                }
            }

            // Match "Jun 18, 02:28 PM" or "July 15, 2025" (must be the whole string or start of string)
            const monthDayMatch = text.match(/^(?:\w+,\s*)?([a-z]{3,9})\s+(\d{1,2})(?:,?\s*(\d{4}))?/i);
            if (monthDayMatch) {
                const mStr = monthDayMatch[1].toLowerCase().substring(0, 3);
                let mIdx = monthNamesEn.indexOf(mStr);
                if (mIdx === -1) mIdx = monthNamesEs.indexOf(mStr);
                if (mIdx !== -1) {
                    const day = pad(parseInt(monthDayMatch[2], 10));
                    const year = monthDayMatch[3] || new Date().getFullYear();
                    return `${year}-${pad(mIdx + 1)}-${day}`;
                }
            }

            // Relative dates: "hoy a las...", "ayer..."
            const relMatch = text.match(/^(today|yesterday|hoy|ayer|sunday|monday|tuesday|wednesday|thursday|friday|saturday|domingo|lunes|martes|miércoles|miercoles|jueves|viernes|sábado|sabado|sun|mon|tue|wed|thu|fri|sat|dom|lun|mar|mie|jue|vie|sab)\b/i);
            if (relMatch) {
                const kw = relMatch[1].toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                const now = new Date();
                if (kw === "today" || kw === "hoy") return formatYMD(now);
                if (kw === "yesterday" || kw === "ayer") {
                    const d = new Date(now);
                    d.setDate(d.getDate() - 1);
                    return formatYMD(d);
                }
                const weekdaysEn = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
                const weekdaysEs = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];
                const weekdaysEnShort = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
                const weekdaysEsShort = ["dom", "lun", "mar", "mie", "jue", "vie", "sab"];
                
                let targetIdx = weekdaysEn.indexOf(kw);
                if (targetIdx === -1) targetIdx = weekdaysEs.indexOf(kw);
                if (targetIdx === -1) targetIdx = weekdaysEnShort.indexOf(kw);
                if (targetIdx === -1) targetIdx = weekdaysEsShort.indexOf(kw);
                
                if (targetIdx !== -1) {
                    const d = new Date(now);
                    for (let i = 1; i <= 7; i++) {
                        d.setDate(d.getDate() - 1);
                        if (d.getDay() === targetIdx) return formatYMD(d);
                    }
                }
            }

            // Time-only display in private chats and DMs
            if (/^\d{1,2}:\d{2}(?:\s*(?:AM|PM|am|pm))?$/.test(text)) {
                return "TIME_ONLY";
            }

            return null;
        };

        const prioritySelectors = [
            ".media-viewer-subtitle, .media-header-subtitle, .StoryViewer-subtitle, div[class*='subtitle'], div[class*='SubTitle']",
            "time, [class*='time'], [class*='Time'], .date, [class*='date'], [class*='Date']",
            ".MessageMeta, .sub-text, .meta, span.O6fpaxCe"
        ];

        for (let sel of prioritySelectors) {
            const els = Array.from(root.querySelectorAll(sel));
            for (let el of els) {
                // Strict Spatial Filter: Ensure the element is actually visible on screen right now!
                // This prevents stealing dates from hidden sidebars, previous days' dividers, or off-screen pre-rendered slides.
                let r = el.getBoundingClientRect();
                if (r.width === 0 || r.height === 0 || r.top > window.innerHeight || r.bottom < 0 || r.left > window.innerWidth || r.right < 0) {
                    continue;
                }

                let textToParse = el.getAttribute("title") || el.getAttribute("aria-label") || el.textContent;
                if (!textToParse || textToParse.length > 50) continue; // Skip huge text blocks to prevent false positives

                const parsed = parseDateText(textToParse);
                if (parsed === "TIME_ONLY") foundTimeOnly = true;
                else if (parsed) return parsed;
            }
        }

        // 3. Date Divider Fallback: If we only found a time string (e.g. "21:45") and no full date in titles, 
        // traverse up the DOM to find the preceding Date Separator in the chat feed.
        if (foundTimeOnly) {
            const messageNode = container.closest('.message, .Message, .bubble');
            if (messageNode) {
                let current = messageNode;
                let climbs = 0;
                while (current && climbs < 25) {
                    let prev = current.previousElementSibling;
                    while (prev) {
                        if (prev.classList.contains('date-divider') || 
                            prev.classList.contains('is-date-divider') || 
                            prev.classList.contains('MessageList-date-separator') ||
                            prev.classList.contains('ActionMessage') ||
                            prev.querySelector('.date-divider, .is-date-divider, .MessageList-date-separator, .ActionMessage') ||
                            (prev.classList.contains('service') && prev.textContent.trim().length > 0 && prev.textContent.trim().length < 30)) {
                            
                            let divText = prev.textContent;
                            let parsed = parseDateText(divText);
                            if (parsed && parsed !== "TIME_ONLY") return parsed;
                        }
                        prev = prev.previousElementSibling;
                    }
                    current = current.parentElement;
                    climbs++;
                }
            }
            return formatYMD(new Date()); // Absolute fallback to today if no separator is found
        }

        return null;
    };

    window.__md_tel_extract_post_id = (container) => {
        if (!container) return null;
        
        const root = container.closest(".media-viewer-whole, #MediaViewer, #StoryViewer, #stories-viewer, [role='dialog'], .Profile, .message, .Message, .bubble") || container;

        const msg = root.closest(".message, .Message, .bubble, [data-msg-id], [data-mid], [data-message-id], [data-post-id], [data-story-id], [data-id], [data-media-id], [id*='message'], [id*='post-']") || 
                    root.querySelector("[data-mid], [data-msg-id], [data-message-id], [data-post-id], [data-story-id], [data-id], [data-media-id], [data-photo-id], [data-video-id], [id*='message'], [id*='post-'], .message, .Message, .bubble");
        if (msg) {
            if (msg.hasAttribute("data-mid")) return msg.getAttribute("data-mid");
            if (msg.hasAttribute("data-msg-id")) return msg.getAttribute("data-msg-id");
            if (msg.hasAttribute("data-message-id")) return msg.getAttribute("data-message-id");
            if (msg.hasAttribute("data-id")) return msg.getAttribute("data-id");
            if (msg.hasAttribute("data-media-id")) return msg.getAttribute("data-media-id");
            if (msg.hasAttribute("data-photo-id")) return msg.getAttribute("data-photo-id");
            if (msg.hasAttribute("data-video-id")) return msg.getAttribute("data-video-id");
            if (msg.hasAttribute("data-post-id")) return msg.getAttribute("data-post-id");
            if (msg.hasAttribute("data-story-id")) return msg.getAttribute("data-story-id");
            if (msg.id && (msg.id.includes("message") || msg.id.includes("post") || msg.id.includes("story") || msg.id.includes("media"))) {
                const num = msg.id.replace(/\D/g, "");
                if (num && num.length > 0) return num;
            }
        }

        const link = root.querySelector("a[href*='/'], a[href*='#']");
        if (link) {
            const m = link.getAttribute("href").match(/(?:[_/]|(?:msg_|message|post|story)(?:_id)?=)(\d{2,})(?:[?&/#]|$)/i);
            if (m && m[1]) return m[1];
        }

        const urlStr = window.location.href;
        const hashMatch = urlStr.match(/(?:msg_id|message|post_id|story_id)=?(\d+)/i) || urlStr.match(/(?:[_/])(\d{2,})(?:[?&/#]|$)/);
        if (hashMatch) return hashMatch[1];

        return null;
    };

    window.__md_tel_hashCode = (s) => {
        let h = 0, l = s.length, i = 0;
        if (l > 0) {
            while (i < l) {
                h = ((h << 5) - h + s.charCodeAt(i++)) | 0;
            }
        }
        return h >>> 0;
    };
})();
