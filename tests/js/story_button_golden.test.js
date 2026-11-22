// Golden master for the Instagram story button: where injectStoryButton places the button, and what
// its click handler sends to sendDownloadRequest (URL + metadata), the button state, toasts and whether
// the global media dictionary was mutated.
// Usage: node tests/js/story_button_golden.test.js <fixture.json>   (STORY_BUTTON_RECORD=1 to record)
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const CASES = require('./story_button_cases.js');

const repoRoot = path.resolve(__dirname, '..', '..');
// Same order as manifest.json; files that do not exist (yet) are skipped.
const SCRIPTS = [
    'src/shared/utils/error_reporter.js',
    'src/instagram/ui/svgs.js',
    'src/instagram/media_resolution/clicked_media.js',
    'src/instagram/download/download_metadata.js',
    'src/instagram/download/download_target.js',
    'src/instagram/download/download_feedback.js',
    'src/instagram/ui/button_state.js',
    'src/instagram/stories/story_viewport.js',
    'src/instagram/stories/shared_post_detector.js',
    'src/instagram/stories/story_button_state.js',
    'src/instagram/stories/story_dots_locator.js',
    'src/instagram/stories/story_media_locator.js',
    'src/instagram/stories/story_media_lookup.js',
    'src/instagram/features/story_button.js',
].filter((file) => fs.existsSync(path.join(repoRoot, file)));

function setUp(testCase) {
    const dom = new JSDOM(`<!doctype html><html><body>${testCase.html}</body></html>`, { url: testCase.url, runScripts: 'dangerously', pretendToBeVisual: true });
    const { window } = dom;
    const log = { sent: [], toasts: [], fiberRequests: [], consoleErrors: 0 };
    window.__md_storyMediaDict = JSON.parse(JSON.stringify(testCase.dictionary || {}));
    if (testCase.previousStoryKey) window.__md_lastActiveStoryKey = testCase.previousStoryKey;
    window.console.error = () => { log.consoleErrors++; };
    window.console.warn = () => {};
    window.MDToastManager = Object.fromEntries(['showInfo', 'showError', 'showSuccess', 'showWarning', 'showComplex'].map((kind) =>
        [kind, (message) => log.toasts.push(kind === 'showComplex' ? `${kind}:${message.title}|${message.action.href}` : `${kind}:${message}`)]));
    window.postMessage = (data) => {
        log.fiberRequests.push(Object.keys(data).filter((key) => key !== 'id').sort().join(','));
        const answer = testCase.fiber;
        if (answer === undefined) return;
        // Same shape ig_interceptor_init.js stores for an MD_FIBER_RESULT message.
        window.setTimeout(() => {
            window.__md_fiberResults[data.id] = { url: answer.url, dash_manifest: answer.dash, media_id: answer.media_id, index: answer.index, shortcode: answer.shortcode, user: answer.user, time: answer.time };
        }, 20);
    };
    applyRects(window);
    for (const file of SCRIPTS) {
        const script = window.document.createElement('script');
        script.textContent = fs.readFileSync(path.join(repoRoot, file), 'utf8') + `\n//# sourceURL=${file}`;
        window.document.head.appendChild(script);
    }
    window.sendDownloadRequest = (button, url, metadata, isFloating) => {
        if (testCase.sendThrows) throw new Error('host unavailable');
        log.sent.push({ url, metadata: JSON.parse(JSON.stringify(metadata)), isFloating, buttonLoading: button.classList.contains('md-loading') });
    };
    return { window, log };
}

function applyRects(window) {
    for (const element of window.document.querySelectorAll('[rect]')) {
        const [left, top, width, height] = element.getAttribute('rect').split(',').map(Number);
        element.getBoundingClientRect = () => ({ left, top, width, height, right: left + width, bottom: top + height });
    }
}

/** @returns {object} where the download button ended up */
function describeButtons(window) {
    const buttons = Array.from(window.document.querySelectorAll('.md-story-dl-btn-inline'));
    return buttons.map((button) => ({
        id: button.id || null,
        before: button.nextElementSibling ? button.nextElementSibling.id || button.nextElementSibling.tagName : null,
        className: button.className,
        opacity: button.style.opacity,
        title: button.title,
        hasIcon: button.innerHTML.includes('<svg'),
    }));
}

function cachedDotsId(window) {
    return window.__md_cachedStoryDots ? window.__md_cachedStoryDots.id || 'unnamed' : null;
}

function runInjection(testCase) {
    const { window, log } = setUp(testCase);
    window.injectStoryButton();
    if (testCase.secondCall) {
        window.document.querySelector(testCase.secondCall.appendTo).insertAdjacentHTML('beforeend', testCase.secondCall.html);
        applyRects(window);
        window.injectStoryButton();
    }
    const result = {
        buttons: describeButtons(window),
        hijacked: Array.from(window.document.querySelectorAll('.md-hijacked-dots')).map((element) => element.id),
        cachedDots: cachedDotsId(window),
        lastStoryKey: window.__md_lastActiveStoryKey || null,
        consoleErrors: log.consoleErrors,
    };
    window.close();
    return result;
}

async function runClick(testCase) {
    const { window, log } = setUp(testCase);
    window.injectStoryButton();
    const button = window.document.querySelector('.md-story-dl-btn-inline');
    await button.onclick({ preventDefault() {}, stopPropagation() {} });
    const state = window.document.body.__md_download_state;
    const result = {
        ...log,
        button: { className: button.className, opacity: button.style.opacity, background: button.style.background },
        downloadState: state ? { class: state.class, isFloating: state.isFloating, storyKey: state.storyKey, hasHtml: Boolean(state.html) } : null,
        dictionaryAfter: window.__md_storyMediaDict,
        pendingFiberResults: Object.keys(window.__md_fiberResults || {}).length,
        taggedMedia: Array.from(window.document.querySelectorAll('[data-md-id]')).map((element) => element.id),
    };
    window.close();
    return result;
}

(async () => {
    const fixturePath = path.resolve(process.argv[2]);
    const results = {};
    for (const testCase of CASES.injection) results[`inject:${testCase.name}`] = runInjection(testCase);
    for (const testCase of CASES.click) results[`click:${testCase.name}`] = await runClick(testCase);
    if (process.env.STORY_BUTTON_RECORD === '1') {
        fs.writeFileSync(fixturePath, JSON.stringify(results, null, 2) + '\n');
        console.log(`recorded ${Object.keys(results).length} cases (${SCRIPTS.length} scripts) -> ${fixturePath}`);
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
