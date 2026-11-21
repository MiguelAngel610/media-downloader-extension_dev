// globals and logger
window.__md_vanishMode = false;
window.__md_ghostOnline = false;
window.__md_ghostSeen = false;

export function mdLog(badge, message, badgeColor = "#3b82f6") {
    console.log(
        `%c ${badge} %c ${message} `,
        `background: ${badgeColor}; color: #ffffff; font-weight: 700; font-size: 11px; border-radius: 4px 0 0 4px; padding: 2px 6px; font-family: 'Inter', system-ui, -apple-system, sans-serif;`,
        `background: #1e293b; color: #f8fafc; font-size: 11px; border-radius: 0 4px 4px 0; padding: 2px 8px; font-family: 'Inter', system-ui, -apple-system, sans-serif; font-weight: 500; border: 1px solid #334155; border-left: none;`
    );
}

/**
 * Zero Silent Errors: every caught failure in the MAIN world goes through here.
 * @param {string} context
 * @param {unknown} error
 */
export function logError(context, error) {
    console.warn(
        `%c ⚠️ ${context} %c ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)} `,
        "background: #dc2626; color: #ffffff; font-weight: 700; font-size: 11px; border-radius: 4px 0 0 4px; padding: 2px 6px;",
        "background: #1e293b; color: #f8fafc; font-size: 11px; border-radius: 0 4px 4px 0; padding: 2px 8px;"
    );
}
