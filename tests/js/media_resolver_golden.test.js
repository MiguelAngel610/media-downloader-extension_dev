// Golden master for resolveMediaUrl (Instagram content script): records the MD_REQUEST_FIBER request it
// sends to the page world and the { bestUrl, bestMetadata } it returns, for every case.
// Usage: node tests/js/media_resolver_golden.test.js <fixture.json>   (RESOLVER_RECORD=1 to record)
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const CASES = require('./media_resolver_cases.js');

const repoRoot = path.resolve(__dirname, '..', '..');
// Same order as manifest.json; files that do not exist (yet) are skipped.
const SCRIPTS = [
    'src/shared/utils/error_reporter.js',
    'src/instagram/media_resolution/clicked_media.js',
    'src/instagram/media_resolution/media_sources.js',
    'src/instagram/utils/media_resolver.js',
].filter((file) => fs.existsSync(path.join(repoRoot, file)));

async function runCase(testCase) {
    const dom = new JSDOM(`<!doctype html><html><body>${testCase.html}</body></html>`,
        { url: testCase.url || 'https://www.instagram.com/', runScripts: 'dangerously', pretendToBeVisual: true });
    const { window } = dom;
    const requests = [];
    window.__md_storyMediaDict = testCase.dictionary || {};
    window.postMessage = (data) => {
        requests.push({ posterSig: data.posterSig, shortcode: data.shortcode, carouselIndex: data.carouselIndex, type: data.type });
        // Simulates ig_interceptor_init.js storing the page-world MD_FIBER_RESULT.
        if (testCase.fiber !== undefined) window.setTimeout(() => { window.__md_fiberResults[data.id] = testCase.fiber; }, 20);
    };
    for (const element of window.document.querySelectorAll('[rect]')) {
        const [left, top, width, height] = element.getAttribute('rect').split(',').map(Number);
        element.getBoundingClientRect = () => ({ left, top, width, height, right: left + width, bottom: top + height });
    }
    // Real <script> elements, like Chrome's classic content scripts (shared global lexical scope).
    for (const file of SCRIPTS) {
        const script = window.document.createElement('script');
        script.textContent = fs.readFileSync(path.join(repoRoot, file), 'utf8') + `\n//# sourceURL=${file}`;
        window.document.head.appendChild(script);
    }
    const media = testCase.media ? window.document.querySelector(testCase.media) : null;
    if (media && testCase.overrideSrc) Object.defineProperty(media, 'src', { get: () => testCase.overrideSrc });
    const article = testCase.article ? window.document.querySelector(testCase.article) : null;

    const output = await window.resolveMediaUrl(media, article, testCase.knownShortcode || null, testCase.carouselIndex || null);
    const result = {
        requests,
        returned: JSON.parse(JSON.stringify(output)),
        taggedElement: Boolean(media && media.getAttribute('data-md-id')),
        pendingFiberResults: Object.keys(window.__md_fiberResults || {}).length,
    };
    window.close();
    return result;
}

(async () => {
    const fixturePath = path.resolve(process.argv[2]);
    const results = {};
    for (const testCase of CASES) results[testCase.name] = await runCase(testCase);
    if (process.env.RESOLVER_RECORD === '1') {
        fs.writeFileSync(fixturePath, JSON.stringify(results, null, 2) + '\n');
        console.log(`recorded ${CASES.length} cases (${SCRIPTS.length} scripts) -> ${fixturePath}`);
        return;
    }
    const golden = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    let failed = 0;
    for (const name of Object.keys(golden)) {
        const same = JSON.stringify(results[name]) === JSON.stringify(golden[name]);
        if (!same) failed++;
        console.log(`${same ? 'PASS' : 'FAIL'}  ${name}`);
        if (!same) console.log(`      expected ${JSON.stringify(golden[name])}\n      actual   ${JSON.stringify(results[name])}`);
    }
    console.log(`\n${Object.keys(golden).length - failed}/${Object.keys(golden).length} passed`);
    process.exitCode = failed ? 1 : 0;
})().catch((err) => { console.error(err); process.exitCode = 1; });
