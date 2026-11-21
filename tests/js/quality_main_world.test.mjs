// Quality regression tests for MAIN-world modules (bundled by esbuild from the real sources).
const posted = [];
const listeners = [];
const store = {};
globalThis.window = globalThis;
globalThis.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); } };
globalThis.location = { href: 'https://www.instagram.com/', origin: 'https://www.instagram.com', search: '', pathname: '/' };
const fakeElements = {};
globalThis.document = {
    head: null, documentElement: { innerHTML: '', appendChild() {} }, body: {},
    getElementById: () => null, querySelectorAll: () => [], createElement: () => ({ style: {} }),
    querySelector: (sel) => { const m = sel.match(/data-md-id="([^"]+)"/); return m ? fakeElements[m[1]] || null : null; },
};
globalThis.addEventListener = (type, fn) => { if (type === 'message') listeners.push(fn); };
globalThis.postMessage = (data) => posted.push(data);
const deliver = (data) => listeners.forEach((fn) => fn({ data, source: window, origin: location.origin }));

const { pickBestVideoUrl, pickBestImageUrl, pickBestProfilePicUrl } = await import('../../src/instagram/interceptors/core/media_quality.js');
const { processAndPostData } = await import('../../src/instagram/interceptors/core/media_parser.js');
await import('../../src/instagram/interceptors/core/fiber_search.js');

const results = [];
const check = (name, ok) => results.push([ok ? 'PASS' : 'FAIL', name]);
const v = (w, h, tag, type = 101) => ({ width: w, height: h, type, url: `https://scontent.cdninstagram.com/v/${tag}.mp4?q=${w}` });
const img = (w, h, file) => ({ width: w, height: h, url: `https://scontent.cdninstagram.com/v/t51.2885-15/${file}.jpg?stp=dst-jpg_e35_p${w}x${h}` });

// --- media_quality
check('Q2a best video regardless of order', pickBestVideoUrl([v(720, 1280, 'a'), v(1080, 1920, 'b'), v(480, 854, 'c')]).includes('?q=1080'));
check('Q2b equal resolution -> higher type wins', pickBestVideoUrl([v(720, 1280, 'x', 101), v(720, 1280, 'y', 103)]).includes('/y.mp4'));
check('Q2c entries without url are ignored', pickBestVideoUrl([{ width: 4000, height: 4000 }, v(720, 1280, 'ok')]).includes('/ok.mp4'));
const slideA = [img(640, 640, 'slideA_n'), img(1440, 1440, 'slideA_n'), img(320, 320, 'slideA_n')];
const slideB = [img(1440, 1440, 'slideB_n')];
check('Q4a signature picks LARGEST of that slide (not first)', pickBestImageUrl([...slideA, ...slideB], 'slideA_n').includes('p1440x1440') && pickBestImageUrl([...slideA, ...slideB], 'slideA_n').includes('slideA_n'));
check('Q4b signature with no match returns null (wrong slide guard)', pickBestImageUrl(slideB, 'slideA_n') === null);
check('Q1a pfp priority: hd_profile_pic_url_info first', pickBestProfilePicUrl({ profile_pic_url_hd: 'https://x/320', hd_profile_pic_url_info: { url: 'https://x/1080' } }) === 'https://x/1080');
check('Q1b pfp: largest hd_profile_pic_versions', pickBestProfilePicUrl({ hd_profile_pic_versions: [{ width: 320, height: 320, url: 'https://x/320' }, { width: 640, height: 640, url: 'https://x/640' }] }) === 'https://x/640');

// --- media_parser: dictionary keeps the best + profile collector
posted.length = 0;
processAndPostData({ data: { user: {
    username: 'danyancat', profile_pic_url_hd: 'https://scontent/pfp_320.jpg', hd_profile_pic_url_info: { url: 'https://scontent/pfp_1080.jpg' },
    edge_owner_to_timeline_media: { items: [{ id: '111_9', code: 'ABCDEFGHIJK', taken_at: 1700000000, user: { username: 'danyancat' },
        video_versions: [v(480, 854, 'low'), v(1080, 1920, 'high')] }] },
} } });
const pfpMsg = posted.find((m) => m.type === 'MD_PFP_RESULT');
check('Q1c collector forwards full-HD avatar from API JSON', pfpMsg && pfpMsg.username === 'danyancat' && pfpMsg.url === 'https://scontent/pfp_1080.jpg');
check('Q1d collector does not re-send an unchanged avatar', (() => { posted.length = 0; processAndPostData({ user: { username: 'danyancat', hd_profile_pic_url_info: { url: 'https://scontent/pfp_1080.jpg' } } }); return !posted.some((m) => m.type === 'MD_PFP_RESULT'); })());
check('Q1e weaker source later never downgrades', (() => { posted.length = 0; processAndPostData({ user: { username: 'danyancat', profile_pic_url_hd: 'https://scontent/pfp_320b.jpg' } }); return !posted.some((m) => m.type === 'MD_PFP_RESULT'); })());
check('Q2d dictionary stores best progressive video', window.__md_storyMedia['111'] && window.__md_storyMedia['111'].url.includes('/high.mp4'));

// --- real fiber_search: video with unordered versions, carousel image slide by posterSig
function runFiber(props, extra = {}) {
    const id = 'md_test_' + Math.random();
    fakeElements[id] = { ['__reactFiber$t']: { memoizedProps: props, return: null }, closest: () => null, parentElement: null };
    posted.length = 0;
    deliver({ type: 'MD_REQUEST_FIBER', id, ...extra });
    return posted.find((m) => m.type === 'MD_FIBER_RESULT' && m.id === id);
}
const fiberVideo = runFiber({ media: { code: 'ABCDEFGHIJK', pk: '222', taken_at: 1700000000, user: { username: 'u1' },
    video_versions: [v(640, 1136, 'mid'), v(1080, 1920, 'top'), v(360, 640, 'low')] } });
check('Q2e fiber returns highest video (was video_versions[0])', fiberVideo && fiberVideo.url.includes('/top.mp4'));
const fiberImg = runFiber({ media: { code: 'ZYXWVUTSRQP', taken_at: 1700000000, user: { username: 'u2' },
    image_versions2: { candidates: [img(640, 800, 'slide2_n'), img(1080, 1350, 'slide2_n'), img(1440, 1800, 'other_n')] } } }, { posterSig: 'slide2_n' });
check('Q4c fiber returns largest candidate of the clicked image', fiberImg && fiberImg.url.includes('slide2_n') && fiberImg.url.includes('p1080x1350'));

// --- bug E: Fiber result must carry user + time (seconds), device_timestamp arrives in microseconds
const fiberMeta = runFiber({ media: { code: 'QWERTYUIOPA', pk: '333', device_timestamp: 1700000000123456, user: { username: 'reel_owner' },
    video_versions: [v(1080, 1920, 'r')] } });
check('E1 fiber result includes username', fiberMeta && fiberMeta.user === 'reel_owner');
check('E2 fiber time normalized from microseconds to seconds', fiberMeta && fiberMeta.time === 1700000000);
processAndPostData({ items: [{ id: '444_1', device_timestamp: 1700000000123456, user: { username: 'z' }, image_versions2: { candidates: [img(1080, 1080, 'z_n')] } }] });
check('E3 dictionary timestamp normalized (was microseconds -> host crash)', window.__md_storyMedia['444'] && window.__md_storyMedia['444'].timestamp === 1700000000);

for (const [s, n] of results) console.log(`${s}  ${n}`);
const failed = results.filter(([s]) => s === 'FAIL').length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
