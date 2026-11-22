// Golden master for detectSharedReelOrPost (Instagram story viewer content script).
// Usage: node tests/js/shared_post_golden.test.js <fixture.json>   (SHARED_POST_RECORD=1 to record)
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { loadContentScripts } = require('./helpers/content_scripts.js');
const CASES = require('./shared_post_cases.js');

const SCRIPTS = [
    'src/shared/utils/error_reporter.js',
    'src/instagram/stories/story_viewport.js',
    'src/instagram/stories/shared_post_detector.js',
    'src/instagram/features/story_button.js',
];

/** @returns {string} stable description of the element a detection points at */
function describe(element) {
    if (!element) return null;
    return `${element.tagName.toLowerCase()}${element.id ? '#' + element.id : ''}:${element.textContent.trim().slice(0, 30)}`;
}

function runCase(testCase) {
    const dom = new JSDOM(`<!doctype html><html><body>${testCase.html}</body></html>`, { url: testCase.url, runScripts: 'dangerously', pretendToBeVisual: true });
    const { window } = dom;
    window.__md_storyMediaDict = testCase.dictionary;
    for (const element of window.document.querySelectorAll('[rect]')) {
        const [left, top, width, height] = element.getAttribute('rect').split(',').map(Number);
        element.getBoundingClientRect = () => ({ left, top, width, height, right: left + width, bottom: top + height });
    }
    loadContentScripts(window, SCRIPTS);
    const detection = window.detectSharedReelOrPost();
    const result = {
        detection: { ...detection, element: describe(detection.element) },
        toastStillPresent: Boolean(window.document.getElementById('md-reel-warning-toast')),
    };
    window.close();
    return result;
}

const fixturePath = path.resolve(process.argv[2]);
const results = Object.fromEntries(CASES.map((testCase) => [testCase.name, runCase(testCase)]));
if (process.env.SHARED_POST_RECORD === '1') {
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
