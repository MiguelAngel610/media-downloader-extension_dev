// Golden master for the Instagram download request pipeline (sendDownloadRequest and its helpers).
// Usage: node tests/js/download_request_golden.test.js <fixture.json>   (DOWNLOAD_RECORD=1 to record)
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const CASES = require('./download_request_cases.js');

const repoRoot = path.resolve(__dirname, '..', '..');
const FIXED_NOW = 1800000000000;
// Same order as manifest.json; files that do not exist (yet) are skipped.
const SCRIPTS = [
    'src/shared/utils/error_reporter.js',
    'src/instagram/utils/platform.js',
    'src/instagram/ui/svgs.js',
    'src/instagram/utils/username_resolver.js',
    'src/instagram/download/download_metadata.js',
    'src/instagram/download/download_target.js',
    'src/instagram/download/download_feedback.js',
    'src/instagram/ui/button_state.js',
].filter((file) => fs.existsSync(path.join(repoRoot, file)));

function createButton(window, testCase) {
    const button = window.document.createElement('button');
    button.className = testCase.button === 'story' ? 'md-native-btn md-story-dl-btn-inline' : 'md-post-btn';
    button.innerHTML = '<svg class="x"></svg>';
    const post = window.document.getElementById('post');
    if (testCase.button === 'in-article' && post) post.appendChild(button);
    else window.document.body.appendChild(button); // overlay root / story header live outside the post
    return button;
}

function runCase(testCase) {
    const dom = new JSDOM(`<!doctype html><html><head><title>Instagram</title></head><body>${testCase.html}</body></html>`,
        { url: testCase.url, runScripts: 'dangerously' });
    const { window } = dom;
    const log = { message: null, toasts: [], alerts: [], errors: [] };
    window.Date.now = () => FIXED_NOW;
    window.alert = (text) => log.alerts.push(text);
    window.console.error = (...args) => log.errors.push(args.map(String).join(' '));
    window.MDToastManager = Object.fromEntries(['showInfo', 'showError', 'showSuccess', 'showWarning']
        .map((kind) => [kind, (message, _duration, detail) => log.toasts.push([kind, message, detail || null])]));
    window.chrome = {
        runtime: {
            id: testCase.runtimeId === null ? undefined : 'test-extension',
            lastError: undefined,
            sendMessage(message, callback) {
                log.message = JSON.parse(JSON.stringify(message));
                if (testCase.navigateTo) window.history.pushState({}, '', testCase.navigateTo);
                callback(testCase.response || { status: 'queued', requestId: 'r1' });
            },
        },
        storage: { local: { get: (_keys, callback) => callback({ selectedAccount: testCase.account }) } },
    };
    // Real <script> elements, like Chrome's classic content scripts: top-level const/let are shared between files.
    for (const file of SCRIPTS) {
        const script = window.document.createElement('script');
        script.textContent = fs.readFileSync(path.join(repoRoot, file), 'utf8') + `\n//# sourceURL=${file}`;
        window.document.head.appendChild(script);
    }

    const button = createButton(window, testCase);
    const origin = testCase.origin ? window.document.getElementById(testCase.origin) : (testCase.button === 'overlay' ? window.document.getElementById('post') : null);
    const metadata = testCase.metadata === null ? null : JSON.parse(JSON.stringify(testCase.metadata));
    window.sendDownloadRequest(button, testCase.mediaUrl, metadata, true, origin);

    const holders = [['body', window.document.body], ['post', window.document.getElementById('post')]];
    const [holderName, holder] = holders.find(([, el]) => el && el.__md_download_state) || ['none', null];
    const result = {
        message: log.message,
        buttonClass: button.className,
        buttonIcon: button.innerHTML.includes('20 6 9 17 4 12') ? 'check' : (button.innerHTML.includes('7 10 12 15') ? 'download' : 'original'),
        state: holder ? { on: holderName, class: holder.__md_download_state.class, storyKey: holder.__md_download_state.storyKey } : null,
        toasts: log.toasts, alerts: log.alerts, errors: log.errors,
    };
    window.close(); // drops the pending 2 s reset timers
    return result;
}

const fixturePath = path.resolve(process.argv[2]);
const results = Object.fromEntries(CASES.map((testCase) => [testCase.name, runCase(testCase)]));
if (process.env.DOWNLOAD_RECORD === '1') {
    fs.writeFileSync(fixturePath, JSON.stringify(results, null, 2) + '\n');
    console.log(`recorded ${CASES.length} cases (${SCRIPTS.length} scripts) -> ${fixturePath}`);
    process.exit(0);
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
process.exit(failed ? 1 : 0);
