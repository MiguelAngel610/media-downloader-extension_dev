// Behavioral test for the MV3 service worker modules with simulated chrome.* APIs.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const repo = process.argv[2];

const sessionData = {}; // shared across "worker restarts" like real chrome.storage.session
const localData = { selectedAccount: 'M' };

function bootWorker() {
    const log = { tabMessages: [], tabsCreated: [], tabsRemoved: [], alarms: {}, posted: [], ports: [] };
    const listeners = { message: [], alarm: [], tabRemoved: [], filename: [] };
    let nextTabId = 100;
    const ev = (arr) => ({ addListener: (fn) => arr.push(fn) });
    function makePort() {
        const port = { messageListeners: [], disconnectListeners: [], postMessage: (m) => log.posted.push(m) };
        port.onMessage = ev(port.messageListeners);
        port.onDisconnect = ev(port.disconnectListeners);
        port.hostSends = (m) => port.messageListeners.forEach((fn) => fn(m));
        port.hostDies = (errMsg) => { chrome.runtime.lastError = errMsg ? { message: errMsg } : undefined; port.disconnectListeners.forEach((fn) => fn()); chrome.runtime.lastError = undefined; };
        log.ports.push(port);
        return port;
    }
    const chrome = {
        runtime: { onMessage: ev(listeners.message), connectNative: () => makePort(), lastError: undefined },
        storage: {
            session: { get: async (k) => ({ [k]: sessionData[k] }), set: async (o) => { Object.assign(sessionData, JSON.parse(JSON.stringify(o))); } },
            local: { get: async (k) => ({ [k]: localData[k] }) },
        },
        alarms: { create: async (name, info) => { log.alarms[name] = info; }, clear: async (name) => { delete log.alarms[name]; return true; }, onAlarm: ev(listeners.alarm) },
        tabs: {
            sendMessage: async (tabId, msg) => { log.tabMessages.push({ tabId, msg }); },
            create: async (opts) => { const tab = { id: nextTabId++, ...opts }; log.tabsCreated.push(tab); return tab; },
            remove: async (id) => { log.tabsRemoved.push(id); },
            query: (q, cb) => cb([]),
            onRemoved: ev(listeners.tabRemoved),
        },
        downloads: { setUiOptions: async () => {}, download: async () => 1, onDeterminingFilename: ev(listeners.filename) },
    };
    const ctx = { chrome, console: { log() {}, info() {}, warn() {}, error() {} }, crypto: require('crypto').webcrypto, structuredClone,
        setTimeout, clearTimeout, AbortController, URL, fetch: async () => ({ headers: { get: () => null } }), Date, Promise, JSON, Object, Array, Set, Map, String, Number, Boolean, Error, RegExp, Math, isNaN };
    ctx.self = ctx;
    ctx.importScripts = (...files) => files.forEach((f) => vm.runInContext(fs.readFileSync(path.join(repo, f), 'utf8'), ctx, { filename: f }));
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(path.join(repo, 'src/background/background.js'), 'utf8'), ctx, { filename: 'background.js' });
    const send = (request, tabId) => new Promise((resolve) => {
        const sender = tabId === null ? {} : { tab: { id: tabId, url: 'https://www.instagram.com/x/' } };
        const handled = listeners.message.some((fn) => fn(request, sender, resolve) === true);
        if (!handled) resolve('__unhandled__');
    });
    const fireAlarm = (name) => listeners.alarm.forEach((fn) => fn({ name }));
    return { log, send, fireAlarm, port: () => log.ports[log.ports.length - 1], listeners };
}
const flush = () => new Promise((r) => setTimeout(r, 20));
const results = [];
const check = (name, ok) => results.push([ok ? 'PASS' : 'FAIL', name]);
const resetSession = () => { for (const k of Object.keys(sessionData)) delete sessionData[k]; };

(async () => {
    // 1. Requests before host_ready are queued, then flushed; result goes only to the requesting tab.
    resetSession();
    let w = bootWorker();
    const r1 = await w.send({ action: 'queue_download', url: 'https://cdn/a.jpg', platform: 'instagram', mediaType: 'direct_story' }, 7);
    check('SW1 queue_download answers queued + requestId', r1.status === 'queued' && typeof r1.requestId === 'string');
    check('SW2 nothing sent before host_ready (outbox)', w.log.posted.length === 0);
    w.port().hostSends({ action: 'host_ready' }); await flush();
    check('SW3 outbox flushed with request_id after host_ready', w.log.posted.length === 1 && w.log.posted[0].request_id === r1.requestId);
    await w.send({ action: 'queue_download', url: 'https://cdn/b.jpg', platform: 'instagram' }, 9);
    w.port().hostSends({ status: 'success', filename: 'a.jpg', request_id: r1.requestId }); await flush();
    const delivered = w.log.tabMessages.filter((m) => m.msg.action === 'host_response');
    check('SW4 result delivered ONLY to tab 7 (no broadcast)', delivered.length === 1 && delivered[0].tabId === 7 && delivered[0].msg.requestId === r1.requestId);
    w.port().hostSends({ status: 'progress', percent: '10%' }); await flush();
    check('SW5 progress messages are dropped', w.log.tabMessages.filter((m) => m.msg.action === 'host_response').length === 1);

    // 2. Host crash: in-flight requests fail, worker reconnects via alarm (not setTimeout).
    w.port().hostDies('Native host has exited.'); await flush();
    const crashFail = w.log.tabMessages.find((m) => m.tabId === 9 && m.msg.response.status === 'error');
    check('SW6 crash -> in-flight request reported as error to its tab', Boolean(crashFail));
    check('SW7 reconnect scheduled with chrome.alarms', Boolean(w.log.alarms['md-native-host-reconnect']));
    const portsBefore = w.log.ports.length;
    w.fireAlarm('md-native-host-reconnect');
    check('SW8 alarm reconnects the native port', w.log.ports.length === portsBefore + 1);

    // 3. Host not installed: graceful fallback with explicit message, outbox cleared, later requests rejected.
    resetSession();
    w = bootWorker();
    await w.send({ action: 'queue_download', url: 'https://cdn/c.jpg', platform: 'instagram' }, 11);
    w.port().hostDies('Specified native messaging host not found.'); await flush();
    const missing = w.log.tabMessages.find((m) => m.tabId === 11 && m.msg.response.status === 'error');
    check('SW9 host missing -> tab gets install instructions', missing && /not installed/.test(missing.msg.response.message));
    check('SW10 host missing -> outbox cleared (no surprise downloads later)', (sessionData.md_native_outbox || []).length === 0);
    const r2 = await w.send({ action: 'queue_download', url: 'https://cdn/d.jpg', platform: 'instagram' }, 11);
    check('SW11 next request rejected immediately while host missing', r2.status === 'error' && /not installed/.test(r2.message));

    // 4. Popup Quick Download (was a dead "download" action).
    resetSession();
    w = bootWorker();
    const ok = await w.send({ action: 'download_url', url: 'https://www.instagram.com/p/ABC/' }, null);
    check('SW12 download_url with Instagram link is queued', ok.status === 'queued');
    w.port().hostSends({ action: 'host_ready' }); await flush();
    check('SW13 platform detected as instagram', w.log.posted[0] && w.log.posted[0].platform === 'instagram');
    const bad = await w.send({ action: 'download_url', url: 'https://example.com/x' }, null);
    check('SW14 unsupported link -> clear error', bad.status === 'error' && /Unsupported/.test(bad.message));

    // 5. Backup survives a service worker restart (state in storage.session, delays via alarms).
    resetSession();
    w = bootWorker();
    w.port().hostSends({ action: 'host_ready' });
    w.port().hostSends({ action: 'start_backup', users: [{ username: 'alice', cuenta: 'V' }, 'bob', '../evil'] }); await flush();
    const aliceTab = w.log.tabsCreated[0];
    check('SW15 first profile tab opened', aliceTab && aliceTab.url === 'https://www.instagram.com/alice/');
    const status = await w.send({ action: 'check_backup_status' }, aliceTab.id);
    check('SW16 backup tab gets its job (username + cuenta)', status.isBackingUp && status.username === 'alice' && status.cuenta === 'V');
    await w.send({ action: 'backup_user_done', username: 'alice' }, aliceTab.id);
    check('SW17 done -> tab closed and next scheduled by alarm', w.log.tabsRemoved.includes(aliceTab.id) && Boolean(w.log.alarms['md-backup-next-user']));
    const w2 = bootWorker(); // worker killed and restarted: globals gone, session storage kept
    w2.fireAlarm('md-backup-next-user'); await flush();
    check('SW18 after worker restart the alarm continues with "bob"', w2.log.tabsCreated[0] && w2.log.tabsCreated[0].url.endsWith('/bob/'));
    check('SW19 invalid username "../evil" never opened', ![...w.log.tabsCreated, ...w2.log.tabsCreated].some((t) => t.url.includes('evil')));
    w2.port().hostSends({ action: 'stop_backup' }); await flush();
    check('SW20 stop_backup clears queue and closes current tab', w2.log.tabsRemoved.includes(w2.log.tabsCreated[0].id) && sessionData.md_backup_state.queue.length === 0 && !sessionData.md_backup_state.current);

    for (const [s, n] of results) console.log(`${s}  ${n}`);
    const failed = results.filter(([s]) => s === 'FAIL').length;
    console.log(`\n${results.length - failed}/${results.length} passed`);
    process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
