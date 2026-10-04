class MDFilenameFormatter {
    /**
     * Formats a filename to the standard: YYYY-MM-DD_ID[_index].ext
     * 
     * @param {string|Date|number} dateInput - The date of the media. If null, uses current date.
     * @param {string} id - The unique identifier of the post/message (shortcode, tweetId, msgId).
     * @param {string} extension - The file extension (e.g., "mp4", "jpg").
     * @param {string|number} [index] - Optional. An index or short random string to prevent duplicates in carousels.
     * @returns {string} The standardized filename.
     */
    static format(dateInput, id, extension, index = null) {
        let dateStr = "YYYY-MM-DD";
        
        try {
            if (!dateInput) {
                dateInput = new Date();
            }
            
            // If it's already perfectly formatted "YYYY-MM-DD"
            if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
                dateStr = dateInput;
            } else {
                let d = new Date(dateInput);
                if (isNaN(d.getTime())) {
                    d = new Date();
                }
                const year = d.getFullYear();
                const month = String(d.getMonth() + 1).padStart(2, '0');
                const day = String(d.getDate()).padStart(2, '0');
                dateStr = `${year}-${month}-${day}`;
            }
        } catch (e) {
            console.error("[FilenameFormatter] Error parsing date:", e);
            const now = new Date();
            dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        }

        // Clean extension
        let ext = String(extension).replace(/^\./, '').toLowerCase();
        
        // Fallback for missing extension
        if (!ext || ext === "undefined") ext = "mp4";

        // Fallback for missing ID
        if (!id) id = "media";

        // Build base name
        let filename = `${dateStr}_${id}`;

        // Append index if provided
        if (index !== null && index !== undefined && index !== '') {
            filename += `_${index}`;
        }

        return `${filename}.${ext}`;
    }

    /**
     * Formats a date to the full datetime standard: YYYYMMDD_HHMMSS
     * Ideal for Google Photos and iCloud backup formats.
     * 
     * @param {string|Date|number} dateInput - The date to format. If null, uses current date.
     * @returns {string} The standardized datetime string (e.g., 20221231_223239).
     */
    static formatDateTime(dateInput, includeSeconds = true) {
        let d;
        try {
            d = dateInput ? new Date(dateInput) : new Date();
            if (isNaN(d.getTime())) {
                d = new Date();
            }
        } catch (e) {
            console.error("[FilenameFormatter] Error parsing date:", e);
            d = new Date();
        }

        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const hours = String(d.getHours()).padStart(2, '0');
        const minutes = String(d.getMinutes()).padStart(2, '0');
        
        if (includeSeconds) {
            const seconds = String(d.getSeconds()).padStart(2, '0');
            return `${year}${month}${day}_${hours}${minutes}${seconds}`;
        } else {
            return `${year}${month}${day}_${hours}${minutes}`;
        }
    }

    /**
     * Generates a short 4-character random string for collision prevention.
     */
    static randomSuffix() {
        return Math.random().toString(36).substring(2, 6);
    }
}

// Expose globally
if (typeof window !== 'undefined') {
    window.FilenameFormatter = MDFilenameFormatter;
}
if (typeof self !== 'undefined') {
    self.FilenameFormatter = MDFilenameFormatter;
    self.MDFilenameFormatter = MDFilenameFormatter;
}
