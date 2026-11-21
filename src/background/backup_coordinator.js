/* Media Downloader - Backup Coordinator (service worker)
 * Processes start_backup commands from the desktop app one profile at a time:
 * opens the profile in a background tab, where auto_backup.js does the work and reports
 * backup_user_done. State is persisted (chrome.storage.session) and the pauses between
 * profiles use chrome.alarms, so a suspended service worker resumes exactly where it left off. */

const BACKUP_STATE_KEY = 'md_backup_state';
const BACKUP_NEXT_ALARM = 'md-backup-next-user';
const BACKUP_DELAY_AFTER_USER_MS = 2000;   // breathing room between profiles (rate limits)
const BACKUP_DELAY_AFTER_TAB_CLOSED_MS = 1000;
const BACKUP_USERNAME_PATTERN = /^[A-Za-z0-9._]{1,30}$/;

/** @typedef {{ username: string, cuenta: string }} BackupTarget */
/** @typedef {{ queue: BackupTarget[], current: (BackupTarget & { tabId: number | null }) | null }} BackupState */

/** @type {BackupState} */
const EMPTY_BACKUP_STATE = Object.freeze({ queue: [], current: null });

/**
 * @param {(level: 'info' | 'success' | 'error', text: string) => void} log
 */
function createBackupCoordinator(log) {
    /**
     * @param {unknown} rawTarget - "username" or { username, cuenta }
     * @returns {BackupTarget | null}
     */
    function normalizeTarget(rawTarget) {
        const username = typeof rawTarget === 'object' && rawTarget ? rawTarget.username : rawTarget;
        if (typeof username !== 'string' || !BACKUP_USERNAME_PATTERN.test(username)) return null;
        const cuenta = typeof rawTarget === 'object' && rawTarget && rawTarget.cuenta === 'V' ? 'V' : 'M';
        return { username, cuenta };
    }

    /** @param {number} delayMs */
    function scheduleNext(delayMs) {
        chrome.alarms.create(BACKUP_NEXT_ALARM, { when: Date.now() + delayMs })
            .catch((err) => console.error('[Backup] Could not schedule next profile:', err));
    }

    /** @param {number} tabId */
    function closeTab(tabId) {
        chrome.tabs.remove(tabId).catch((err) => console.warn(`[Backup] Tab ${tabId} already closed:`, err.message));
    }

    async function processNext() {
        /** @type {BackupTarget | null} */
        let next = null;
        await MDSessionStore.updateSession(BACKUP_STATE_KEY, EMPTY_BACKUP_STATE, (state) => {
            if (state.current || state.queue.length === 0) return state;
            next = state.queue.shift();
            state.current = { ...next, tabId: null };
            return state;
        });
        if (!next) return;

        log('info', `\n[Backup] Starting backup for @${next.username}...`);
        const tab = await chrome.tabs.create({ url: `https://www.instagram.com/${next.username}/`, active: false });
        await MDSessionStore.updateSession(BACKUP_STATE_KEY, EMPTY_BACKUP_STATE, (state) => {
            if (state.current && state.current.username === next.username) state.current.tabId = tab.id;
            return state;
        });
    }

    /** @param {unknown} users */
    async function enqueue(users) {
        const targets = (Array.isArray(users) ? users : []).map(normalizeTarget);
        const valid = targets.filter(Boolean);
        if (valid.length !== targets.length) {
            console.warn(`[Backup] Ignored ${targets.length - valid.length} invalid username(s)`);
        }
        await MDSessionStore.updateSession(BACKUP_STATE_KEY, EMPTY_BACKUP_STATE, (state) => {
            state.queue = state.queue.concat(valid);
            return state;
        });
        await processNext();
    }

    async function stop() {
        /** @type {BackupState} */
        let previous = EMPTY_BACKUP_STATE;
        await MDSessionStore.updateSession(BACKUP_STATE_KEY, EMPTY_BACKUP_STATE, (state) => {
            previous = state;
            return { queue: [], current: null };
        });
        await chrome.alarms.clear(BACKUP_NEXT_ALARM);
        if (previous.current && previous.current.tabId !== null) closeTab(previous.current.tabId);
        log('error', '\n[Backup] 🛑 Stopped manually by user.');
    }

    /** @param {number} tabId */
    async function onTabRemoved(tabId) {
        let wasCurrent = false;
        await MDSessionStore.updateSession(BACKUP_STATE_KEY, EMPTY_BACKUP_STATE, (state) => {
            if (state.current && state.current.tabId === tabId) {
                wasCurrent = true;
                state.current = null;
            }
            return state;
        });
        if (!wasCurrent) return;
        log('error', '\n[Backup] ⚠️ Tab was closed externally. Moving to next user...');
        scheduleNext(BACKUP_DELAY_AFTER_TAB_CLOSED_MS);
    }

    /**
     * @param {number} tabId
     * @param {string} username
     */
    async function onUserDone(tabId, username) {
        let wasCurrent = false;
        await MDSessionStore.updateSession(BACKUP_STATE_KEY, EMPTY_BACKUP_STATE, (state) => {
            if (state.current && state.current.tabId === tabId) {
                wasCurrent = true;
                state.current = null;
            }
            return state;
        });
        if (!wasCurrent) {
            console.warn(`[Backup] backup_user_done from non-backup tab ${tabId} ignored`);
            return { ok: false };
        }
        log('success', `[Backup] Finished processing @${username}.`);
        closeTab(tabId);
        scheduleNext(BACKUP_DELAY_AFTER_USER_MS);
        return { ok: true };
    }

    /**
     * @param {number | undefined} tabId
     * @returns {Promise<{ isBackingUp: boolean, username?: string, cuenta?: string }>}
     */
    async function getStatusForTab(tabId) {
        /** @type {BackupState} */
        const state = await MDSessionStore.readSession(BACKUP_STATE_KEY, EMPTY_BACKUP_STATE);
        if (state.current && tabId !== undefined && state.current.tabId === tabId) {
            return { isBackingUp: true, username: state.current.username, cuenta: state.current.cuenta };
        }
        return { isBackingUp: false };
    }

    /** @param {chrome.alarms.Alarm} alarm */
    function handleAlarm(alarm) {
        if (alarm.name === BACKUP_NEXT_ALARM) {
            processNext().catch((err) => console.error('[Backup] Could not start next profile:', err));
        }
    }

    return Object.freeze({ enqueue, stop, onTabRemoved, onUserDone, getStatusForTab, handleAlarm });
}

self.createBackupCoordinator = createBackupCoordinator;
