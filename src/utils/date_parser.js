class MDDateParser {
    /**
     * Parses a localized date and time string from Google Photos or iCloud DOM.
     * Supports English and Spanish formats (e.g. "6 feb 2020", "Thu, 11:03 PM", "May 6, 2024 at 9:24 PM")
     * 
     * @param {string} dateStr The main date string
     * @param {string} [timeStr] Optional time string (used in Google Photos where they are separated)
     * @returns {Date|null} The parsed Date object or null if invalid.
     */
    static parseLocalizedDate(dateStr, timeStr = "") {
        if (!dateStr) return null;
        
        let fullStr = (dateStr + " " + timeStr).toLowerCase();
        
        // Clean up connecting words
        fullStr = fullStr.replace(/de /g, '').replace(/at/g, '').replace(/a las/g, '').replace(/,/g, ' ').trim();

        // 1. Extract Time
        let hours = 0;
        let minutes = 0;
        const timeMatch = fullStr.match(/(\d{1,2}):(\d{2})(?:\s*(am|pm))?/i);
        
        if (timeMatch) {
            hours = parseInt(timeMatch[1], 10);
            minutes = parseInt(timeMatch[2], 10);
            const ampm = timeMatch[3];
            if (ampm === 'pm' && hours < 12) hours += 12;
            if (ampm === 'am' && hours === 12) hours = 0;
            
            // Remove the time from the string so it doesn't interfere with date parsing
            fullStr = fullStr.replace(timeMatch[0], '');
        }

        // 2. Extract Date
        let year = new Date().getFullYear();
        let month = new Date().getMonth();
        let day = new Date().getDate();

        // Check for relative days
        if (fullStr.includes("hoy") || fullStr.includes("today")) {
            // Already set to today
        } else if (fullStr.includes("ayer") || fullStr.includes("yesterday")) {
            const yest = new Date(Date.now() - 86400000);
            year = yest.getFullYear();
            month = yest.getMonth();
            day = yest.getDate();
        } else {
            const monthsES = { 'ene':0, 'feb':1, 'mar':2, 'abr':3, 'may':4, 'jun':5, 'jul':6, 'ago':7, 'sep':8, 'oct':9, 'nov':10, 'dic':11 };
            const monthsEN = { 'jan':0, 'feb':1, 'mar':2, 'apr':3, 'may':4, 'jun':5, 'jul':6, 'aug':7, 'sep':8, 'oct':9, 'nov':10, 'dec':11 };
            
            const dateTokens = fullStr.split(/\s+/);
            let monthFound = false;
            let dayFound = false;

            for (let token of dateTokens) {
                if (/^\d{4}$/.test(token)) {
                    year = parseInt(token, 10);
                } else if (/^\d{1,2}$/.test(token)) {
                    day = parseInt(token, 10);
                    dayFound = true;
                } else if (token.length >= 3 && !monthFound) {
                    let mText = token.substring(0, 3);
                    if (monthsES[mText] !== undefined) {
                        month = monthsES[mText];
                        monthFound = true;
                    } else if (monthsEN[mText] !== undefined) {
                        month = monthsEN[mText];
                        monthFound = true;
                    }
                }
            }
            
            if (!monthFound && !dayFound) return null; // Parsing failed completely
        }

        const parsedDate = new Date(year, month, day, hours, minutes, 0);
        return isNaN(parsedDate.getTime()) ? null : parsedDate;
    }
}

// Expose globally
if (typeof window !== 'undefined') {
    window.MDDateParser = MDDateParser;
}
if (typeof self !== 'undefined') {
    self.MDDateParser = MDDateParser;
}
