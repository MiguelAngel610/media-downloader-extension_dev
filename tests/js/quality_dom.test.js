// Q1 (profile picture resolver) and X image URL tests on the real sources, in jsdom.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const [resolverPath, xButtonsPath] = process.argv.slice(2);
const results = [];
const check = (name, ok) => results.push([ok ? 'PASS' : 'FAIL', name]);
const CDN = 'https://scontent.cdninstagram.com/v/t51.2885-19/4567_n.jpg';

function page(html = '') {
    const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, { runScripts: 'outside-only', url: 'https://www.instagram.com/danyancat/' });
    const w = dom.window;
    w.posted = [];
    w.postMessage = (data) => w.posted.push(data);
    w.eval(fs.readFileSync(resolverPath, 'utf8'));
    return w;
}
function avatar(w, src, srcset = '') {
    const img = w.document.createElement('img');
    img.src = src;
    if (srcset) img.setAttribute('srcset', srcset);
    w.document.body.appendChild(img);
    return img;
}

(async () => {
    // 1. Network-captured HD wins over everything, no zoom needed
    let w = page();
    w.__md_pfpResults = { danyancat: `${CDN}?stp=dst-jpg_s1080x1080` };
    let r = await w.MDPfpResolver.resolveBestPfpUrl(avatar(w, `${CDN}?stp=dst-jpg_s150x150`), 'DanYanCat');
    check('Q1-1 network HD avatar used (case-insensitive username)', r.source === 'network' && r.url.includes('s1080x1080') && !w.posted.length);

    // 2. THE BUG: displayed 320x320 used to be downloaded as-is. Now it is low-res -> zoom is attempted.
    w = page();
    let img = avatar(w, `${CDN}?stp=dst-jpg_s320x320`);
    setTimeout(() => { img.src = `${CDN}?stp=dst-jpg_s1080x1080`; }, 150); // React swaps src after the DPR spoof
    r = await w.MDPfpResolver.resolveBestPfpUrl(img, 'danyancat', { zoomMaxChecks: 10 });
    check('Q1-2 320x320 is treated as low-res and upgraded via zoom', r.source === 'zoom' && r.url.includes('s1080x1080'));
    check('Q1-3 zoom spoof is restored afterwards', w.posted.some((m) => m.type === 'MD_SPOOF_ZOOM') && w.posted.some((m) => m.type === 'MD_RESTORE_ZOOM'));

    // 3. srcset: largest descriptor, regardless of order
    w = page();
    r = await w.MDPfpResolver.resolveBestPfpUrl(avatar(w, `${CDN}?stp=dst-jpg_s150x150`,
        `${CDN}?stp=dst-jpg_s640x640 640w, ${CDN}?stp=dst-jpg_s150x150 150w, ${CDN}?stp=dst-jpg_s320x320 320w`), 'u');
    check('Q1-4 srcset picks largest descriptor (640w) even when not last', r.source === 'srcset' && r.url.includes('s640x640'));

    // 4. Nothing better anywhere -> keeps the displayed one but flags it as low-res (UI shows a warning)
    w = page();
    r = await w.MDPfpResolver.resolveBestPfpUrl(avatar(w, `${CDN}?stp=dst-jpg_s320x320`), 'u', { zoomMaxChecks: 2 });
    check('Q1-5 only 320 available -> returned with isLowRes=true', r.source === 'displayed' && r.isLowRes === true);

    // 5. Size tags in unrelated base64 params do not count
    w = page();
    check('Q1-6 efg param "12x34" is not read as a size', w.MDPfpResolver.isLowResPfpUrl(`${CDN}?efg=ab12x34cd&stp=dst-jpg_e35`) === false);

    // --- X
    const xSource = fs.readFileSync(xButtonsPath, 'utf8');
    const fnSource = xSource.match(/const X_IMAGE_SIZE_ORIGINAL[\s\S]*?\nfunction toOriginalQualityImageUrl[\s\S]*?\n}\n/)[0];
    const xw = new JSDOM('', { runScripts: 'outside-only' }).window;
    xw.eval(fnSource + '; window.toOriginalQualityImageUrl = toOriginalQualityImageUrl;');
    const toOrig = xw.toOriginalQualityImageUrl;
    check('X-1 PNG stays PNG with name=orig', toOrig('https://pbs.twimg.com/media/AbC?format=png&name=small') === 'https://pbs.twimg.com/media/AbC?format=png&name=orig');
    check('X-2 JPG gets name=orig', toOrig('https://pbs.twimg.com/media/AbC?format=jpg&name=900x900') === 'https://pbs.twimg.com/media/AbC?format=jpg&name=orig');
    check('X-3 legacy path extension converted to ?format=', toOrig('https://pbs.twimg.com/media/AbC.png:large').includes('name=orig') ||
        toOrig('https://pbs.twimg.com/media/AbC.png') === 'https://pbs.twimg.com/media/AbC?format=png&name=orig');

    for (const [s, n] of results) console.log(`${s}  ${n}`);
    const failed = results.filter(([s]) => s === 'FAIL').length;
    console.log(`\n${results.length - failed}/${results.length} passed`);
    process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
