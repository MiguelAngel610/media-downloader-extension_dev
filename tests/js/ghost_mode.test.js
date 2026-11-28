// Behavioral test: runs the real dist/ig_interceptor.bundle.js in a simulated MAIN world.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const bundlePath = path.resolve(process.argv[2]);
const bundleSource = fs.readFileSync(bundlePath, 'utf8');

const ORIGIN = 'https://www.instagram.com';
const timers = [];

/** @param {Record<string, string>} [initialStorage] - localStorage content before the bundle runs */
function createWorld(initialStorage = {}) {
    const listeners = {};
    const calls = { fetch: [], xhrSend: [], beacon: [], wsSend: [] };
    const win = {};

    class WorldResponse extends Response {}
    const elementStub = () => ({ id: '', style: {}, textContent: '', innerHTML: '', appendChild() {}, setAttribute() {}, querySelectorAll: () => [], closest: () => null });
    const doc = {
        head: elementStub(), documentElement: { ...elementStub(), innerHTML: '' }, body: elementStub(),
        getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
        createElement: elementStub, activeElement: null,
    };
    const store = { ...initialStorage };
    class FakeXHR {
        static OPENED = 1;
        constructor() { this.readyState = 0; this.responseType = ''; this.responseText = ''; }
        addEventListener() {}
    }
    FakeXHR.prototype.open = function () { this.readyState = 1; };
    FakeXHR.prototype.send = function (body) { calls.xhrSend.push(body); };
    class FakeWebSocket { constructor() { this.readyState = 1; } }
    FakeWebSocket.CONNECTING = 0; FakeWebSocket.OPEN = 1; FakeWebSocket.CLOSING = 2; FakeWebSocket.CLOSED = 3;
    FakeWebSocket.prototype.send = function (data) { calls.wsSend.push(data); };

    Object.assign(win, {
        window: win, self: win, document: doc, console: { log() {}, warn: (...a) => calls.warn = (calls.warn || []).concat([a.join(' ')]), error() {} },
        location: { href: ORIGIN + '/', origin: ORIGIN, search: '', pathname: '/' },
        localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
        navigator: { sendBeacon(url, data) { calls.beacon.push({ url, data }); return true; } },
        // `win.nextResponseBody` lets a scenario feed the response sniffer a specific API payload.
        fetch: async (input, init) => { calls.fetch.push({ input, init }); return new WorldResponse(win.nextResponseBody || '{}', { headers: { 'content-type': 'application/json' } }); },
        XMLHttpRequest: FakeXHR, WebSocket: FakeWebSocket,
        // The bundle patches JSON.parse and Response.prototype.json: each world gets its own copies
        // so the hooks never leak into the test runner or into the next world.
        Request, Response: WorldResponse, URL, URLSearchParams, FormData, Blob, TextDecoder, ArrayBuffer, Uint8Array, Promise,
        JSON: { parse: JSON.parse, stringify: JSON.stringify }, Object, Array, Math, Date, Error, TypeError, SyntaxError, URIError, String, Number, Set, Map, WeakMap, RegExp, Event: class { constructor(t) { this.type = t; } }, KeyboardEvent: class {}, MouseEvent: class {}, PointerEvent: class {},
        setTimeout: (fn, ms) => { const t = setTimeout(fn, ms); timers.push(t); return t; },
        clearTimeout, setInterval: (fn, ms) => { const t = setInterval(fn, ms); timers.push(t); return t; }, clearInterval,
        requestAnimationFrame: (fn) => setTimeout(fn, 0), queueMicrotask,
        addEventListener: (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); },
        removeEventListener() {}, dispatchEvent() { return true; },
        getComputedStyle: () => ({}), innerWidth: 1280, innerHeight: 800,
    });
    // Delivers a message as if posted from `source` (default: same window, same origin).
    win.deliver = (data, source = win.__ctxWindow, origin = ORIGIN) => {
        for (const fn of listeners.message || []) fn({ data, source, origin });
    };
    win.postMessage = (data) => setTimeout(() => win.deliver(data), 0);
    win.calls = calls;
    vm.createContext(win);
    win.__ctxWindow = vm.runInContext("window", win);
    vm.runInContext(bundleSource, win, { filename: 'ig_interceptor.bundle.js' });
    return win;
}

const tick = (ms = 10) => new Promise((r) => setTimeout(r, ms));
const settings = (v, o, s) => ({ type: 'MD_GHOST_SETTINGS', settings: { vanishMode: v, ghostOnline: o, ghostSeen: s } });
const results = [];
const check = (name, ok) => results.push([ok ? 'PASS' : 'FAIL', name]);

function seenFormData() {
    const fd = new FormData();
    fd.append('fb_api_req_friendly_name', 'usePolarisStoriesV3SeenMutation');
    fd.append('variables', '{"reelId":"1","view_seen_at":1700000000}');
    return fd;
}

(async () => {
    // 1. Fail-closed: seen request BEFORE settings, then vanish ON → never sent.
    {
        const w = createWorld();
        w.fetch('https://www.instagram.com/graphql/query', { method: 'POST', body: seenFormData() });
        await tick();
        check('1a seen fetch (FormData) is held while settings unknown', w.calls.fetch.length === 0);
        w.deliver(settings(true, false, false));
        await tick();
        check('1b held seen fetch stays blocked once vanishMode=true arrives', w.calls.fetch.length === 0);
    }
    // 2. Held request is released when stealth is off.
    {
        const w = createWorld();
        const p = w.fetch('https://www.instagram.com/graphql/query', { method: 'POST', body: seenFormData() });
        await tick();
        w.deliver(settings(false, false, false));
        await p;
        check('2  held seen fetch is released when all flags are false', w.calls.fetch.length === 1);
    }
    // 3. Non-relevant traffic is not delayed by missing settings.
    {
        const w = createWorld();
        await w.fetch('https://www.instagram.com/api/v1/feed/timeline/', { method: 'GET' });
        check('3  normal fetch passes immediately without settings', w.calls.fetch.length === 1);
    }
    // 4. Request object input (old code saw "[object Request]").
    {
        const w = createWorld();
        w.deliver(settings(false, false, true));
        w.fetch(new Request('https://www.instagram.com/api/v1/stories/seen/', { method: 'POST', body: 'x=1' }));
        await tick();
        check('4  Request-object seen fetch is blocked (ghostSeen)', w.calls.fetch.length === 0);
    }
    // 5. XHR with Blob body.
    {
        const w = createWorld();
        w.deliver(settings(true, false, false));
        const xhr = new w.XMLHttpRequest();
        xhr.open('POST', '/api/graphql');
        xhr.send(new Blob(['fb_api_req_friendly_name=usePolarisStoriesV3SeenMutation']));
        await tick(30);
        check('5  XHR with Blob seen body is blocked (vanishMode)', w.calls.xhrSend.length === 0);
        const ok = new w.XMLHttpRequest();
        ok.open('POST', '/api/graphql');
        ok.send('doc_id=123&variables={}');
        check('5b unrelated XHR is sent synchronously', w.calls.xhrSend.length === 1);
    }
    // 6. WebSocket: constants preserved, presence frame dropped.
    {
        const w = createWorld();
        check('6a WebSocket.OPEN constant preserved', w.WebSocket.OPEN === 1);
        w.deliver(settings(false, true, false));
        const ws = new w.WebSocket('wss://edge-chat.instagram.com/chat');
        ws.send(new TextEncoder().encode('...update_presence...').buffer);
        ws.send('regular message');
        check('6b presence frame dropped, regular frame sent', w.calls.wsSend.length === 1 && w.calls.wsSend[0] === 'regular message');
    }
    // 7. Foreign sender cannot change settings.
    {
        const w = createWorld();
        w.deliver(settings(true, true, true));
        w.deliver(settings(false, false, false), { foreignWindow: true }, 'https://evil.example');
        w.fetch('https://www.instagram.com/graphql/query', { method: 'POST', body: seenFormData() });
        await tick();
        check('7  message from another window/origin is ignored', w.calls.fetch.length === 0);
    }
    // 8. sendBeacon with seen payload.
    {
        const w = createWorld();
        w.deliver(settings(true, false, false));
        const ret = w.navigator.sendBeacon('/api/graphql', 'fb_api_req_friendly_name=usePolarisStoriesV3SeenMutation');
        check('8  seen beacon blocked and reports success', ret === true && w.calls.beacon.length === 0);
    }
    // 9. Malformed settings are rejected (state stays unknown → still fail-closed).
    {
        const w = createWorld();
        w.deliver({ type: 'MD_GHOST_SETTINGS', settings: { vanishMode: 'false' } });
        w.fetch('https://www.instagram.com/graphql/query', { method: 'POST', body: seenFormData() });
        await tick();
        check('9  malformed settings rejected, request still held', w.calls.fetch.length === 0 && (w.calls.warn || []).some((m) => m.includes('malformed')));
    }
    // 10. Handshake request is emitted by the MAIN world on load.
    {
        const w = createWorld();
        let requested = false;
        w.addEventListener('message', (e) => { if (e.data && e.data.type === 'MD_GHOST_SETTINGS_REQUEST') requested = true; });
        await tick();
        check('10 MAIN world requests settings on load (handshake)', requested);
    }
    // 13. Native seen replay: a blocked seen request records the opened item's taken_at, and every later
    //     reel payload Instagram parses carries it as `seen`, so Instagram itself opens the next item.
    {
        const w = createWorld();
        w.deliver(settings(true, false, false));
        Object.assign(w.location, { href: ORIGIN + '/stories/d.elless/', pathname: '/stories/d.elless/' });
        const T = 1795800000;
        const item = (n) => ({ id: `10${n}_99`, pk: `10${n}`, taken_at: T + n * 60, user: { username: 'd.elless' }, image_versions2: { candidates: [{ url: `https://cdn.example/${n}.jpg`, width: 1080, height: 1920 }] } });
        const reelPayload = (seen) => JSON.stringify({ data: { xdt_api__v1__feed__reels_media: { reels_media: [
            { id: '99', seen, latest_reel_media: T + 5 * 60, user: { username: 'd.elless' }, items: [1, 2, 3, 4, 5].map(item) },
            { id: '77', seen: 0, latest_reel_media: T, user: { username: 'other.user' }, items: [] },
            { id: 'highlight:555', seen: null, latest_reel_media: T, reel_type: 'highlight_reel', user: { username: 'd.elless' }, items: [] },
        ] } } });
        const seenBody = (variables) => `fb_api_req_friendly_name=usePolarisStoriesV3SeenMutation&variables=${encodeURIComponent(JSON.stringify(variables))}`;
        const reelsOf = (text) => w.JSON.parse(text).data.xdt_api__v1__feed__reels_media.reels_media;

        w.nextResponseBody = reelPayload(null);
        await w.fetch('https://www.instagram.com/graphql/query', { method: 'POST', body: 'doc_id=1&variables={}' });
        await tick(30);
        w.fetch('https://www.instagram.com/graphql/query', { method: 'POST', body: seenBody({ reelId: '99', reelMediaId: '103', reelMediaOwnerId: '99', viewSeenAt: T + 999 }) });
        await tick(30);
        const [own, other, highlight] = reelsOf(reelPayload(null));
        check('13a blocked seen of item 3 replays its taken_at as the reel `seen`', own.seen === T + 3 * 60);
        check('13b reels of other users are untouched', other.seen === 0);
        check('13f highlights of the same owner are untouched', highlight.seen === null);
        check('13c a newer server `seen` is never lowered', reelsOf(reelPayload(T + 4 * 60))[0].seen === T + 4 * 60);
        const viaResponseJson = await new w.Response(reelPayload(0)).json();
        check('13d Response.json() payloads get the same replay', viaResponseJson.data.xdt_api__v1__feed__reels_media.reels_media[0].seen === T + 3 * 60);
        // Unknown media id: the request's own reelMediaTakenAt and the story URL identify the item.
        w.fetch('https://www.instagram.com/graphql/query', { method: 'POST', body: seenBody({ reelId: '99', reelMediaId: '999', reelMediaTakenAt: T + 4 * 60, viewSeenAt: T + 999 }) });
        await tick(30);
        check('13e reelMediaTakenAt from the request is used when the item is not in the dictionary', reelsOf(reelPayload(null))[0].seen === T + 4 * 60);
        let history = null;
        w.addEventListener('message', (e) => { if (e.data && e.data.type === 'MD_GHOST_HISTORY_ADD') history = e.data.username; });
        w.fetch('https://www.instagram.com/graphql/query', { method: 'POST', body: seenBody({ reelId: '99', reelMediaId: '104', reelMediaOwnerId: '99', viewSeenAt: T + 999 }) });
        await tick(30);
        check('13g every blocked story view still reaches the popup stealth history', history === 'd.elless');
    }
    // 14. Records of the retired fallback (gray-ring marks, slide checkpoints) are removed once; the ledger stays.
    {
        const ledger = JSON.stringify({ 'd.elless': { takenAt: 1795800000, updatedAt: Date.now() } });
        const legacy = { md_ghost_seen_users: '{"d.elless":1}', md_ghost_story_checkpoints: '{}', md_ghost_seen_schema: '2', md_ghost_reel_seen: ledger };
        const w = createWorld(legacy);
        const retiredGone = ['md_ghost_seen_users', 'md_ghost_story_checkpoints', 'md_ghost_seen_schema'].every((key) => w.localStorage.getItem(key) === null);
        check('14a retired ghost records are removed on load', retiredGone && w.localStorage.getItem('md_ghost_storage_schema') === '3');
        check('14b the seen ledger survives the migration', w.localStorage.getItem('md_ghost_reel_seen') === ledger);
        const again = createWorld({ md_ghost_storage_schema: '3', md_ghost_seen_users: '{"kept":1}' });
        check('14c the migration runs only once', again.localStorage.getItem('md_ghost_seen_users') === '{"kept":1}');
    }

    for (const [status, name] of results) console.log(`${status}  ${name}`);
    const failed = results.filter(([s]) => s === 'FAIL').length;
    console.log(`\n${results.length - failed}/${results.length} passed`);
    timers.forEach((t) => { clearTimeout(t); clearInterval(t); });
    process.exit(failed ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
