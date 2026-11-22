// Golden master for the Instagram story progress bar (src/instagram/features/progress/story.js, ES module):
// which segment row is used, the "n/total" counter, the slider value, the cache, and what a seek does to
// videos and Web Animations. The module is bundled in memory with esbuild and injected into jsdom.
// Usage: node tests/js/story_progress_golden.test.js <fixture.json>   (STORY_PROGRESS_RECORD=1 to record)
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');
const { JSDOM } = require('jsdom');
const CASES = require('./story_progress_cases.js');

const repoRoot = path.resolve(__dirname, '..', '..');
const PROGRESS_BUNDLE = esbuild.buildSync({
    stdin: {
        contents: "import { syncStoryProgressBar, getActiveStoryMedias } from './story.js';\nwindow.__mdStoryProgress = { syncStoryProgressBar, getActiveStoryMedias };",
        resolveDir: path.join(repoRoot, 'src/instagram/features/progress'),
        sourcefile: 'story_progress_test_entry.js',
    },
    bundle: true, format: 'iife', write: false, logLevel: 'error',
}).outputFiles[0].text;

function applyRects(window) {
    for (const element of window.document.querySelectorAll('[rect]')) {
        const [left, top, width, height] = element.getAttribute('rect').split(',').map(Number);
        element.getBoundingClientRect = () => ({ left, top, width, height, right: left + width, bottom: top + height });
    }
}

function defineMedia(element, spec) {
    const values = { duration: NaN, currentTime: 0, ended: false, paused: false, ...spec };
    for (const [key, value] of Object.entries(values)) {
        let current = value;
        Object.defineProperty(element, key, { configurable: true, get: () => current, set: (next) => { current = next; } });
    }
}

function fakeAnimations(window, specs) {
    return (specs || []).map((spec) => {
        const animation = {
            playState: spec.playState, currentTime: null, plays: 0,
            effect: { target: window.document.querySelector(spec.target), getComputedTiming: () => ({ duration: spec.duration }) },
            play() { this.plays++; },
        };
        return animation;
    });
}

function describeState(window) {
    const container = window.document.getElementById('md-story-progress-container');
    const slider = window.document.getElementById('md-story-slider');
    const counter = window.document.getElementById('md-story-counter');
    return {
        containers: window.document.querySelectorAll('#md-story-progress-container').length,
        containerParent: container && container.parentElement ? container.parentElement.id : null,
        containerVisible: container ? container.classList.contains('md-visible') : null,
        counter: counter ? { text: counter.textContent, ...counter.dataset } : null,
        slider: slider ? { value: slider.value, progress: slider.style.getPropertyValue('--md-progress'), min: slider.min, max: slider.max, step: slider.step, photoOnly: slider.__md_isPhotoOnly } : null,
        hidden: Array.from(window.document.querySelectorAll('.md-hide-native-segments')).map((element) => element.id),
        rowPosition: container && container.parentElement ? container.parentElement.style.position : null,
        cached: window.__md_cachedSegmentsContainer ? window.__md_cachedSegmentsContainer.id : null,
        lastKnownSegmentIndex: window.__md_lastKnownSegmentIndex === undefined ? null : window.__md_lastKnownSegmentIndex,
    };
}

function runCase(testCase) {
    const dom = new JSDOM(`<!doctype html><html><body>${testCase.html}</body></html>`, { url: testCase.url, runScripts: 'dangerously', pretendToBeVisual: true });
    const { window } = dom;
    let consoleErrors = 0;
    window.console.error = () => { consoleErrors++; };
    Object.assign(window, testCase.globals || {});
    applyRects(window);
    for (const [selector, spec] of Object.entries(testCase.media || {})) defineMedia(window.document.querySelector(selector), spec);
    const animations = fakeAnimations(window, testCase.animations);
    window.document.getAnimations = () => animations;
    for (const source of [fs.readFileSync(path.join(repoRoot, 'src/shared/utils/error_reporter.js'), 'utf8'), PROGRESS_BUNDLE]) {
        const script = window.document.createElement('script');
        script.textContent = source;
        window.document.head.appendChild(script);
    }
    const { syncStoryProgressBar, getActiveStoryMedias } = window.__mdStoryProgress;

    const frames = [];
    syncStoryProgressBar();
    frames.push(describeState(window));
    if ((testCase.frames || 1) > 1) {
        if (testCase.detachCacheBeforeSecondFrame) window.__md_cachedSegmentsContainer = window.document.createElement('div');
        if (testCase.dragBeforeSecondFrame) window.document.getElementById('md-story-slider').dispatchEvent(new window.Event('pointerdown'));
        if (testCase.changeFillBeforeSecondFrame) {
            const [selector, width] = testCase.changeFillBeforeSecondFrame;
            window.document.querySelector(selector).setAttribute('rect', `312,12,${width},2`);
            applyRects(window);
        }
        syncStoryProgressBar();
        frames.push(describeState(window));
    }

    const result = { frames, activeMedias: getActiveStoryMedias().map((element) => element.id), consoleErrors };
    if (testCase.seek !== undefined) {
        const slider = window.document.getElementById('md-story-slider');
        slider.value = String(testCase.seek);
        slider.dispatchEvent(new window.Event('input'));
        result.seek = {
            progress: slider.style.getPropertyValue('--md-progress'),
            media: Object.fromEntries(Object.keys(testCase.media || {}).map((selector) => [selector, window.document.querySelector(selector).currentTime])),
            animations: animations.map((animation) => ({ currentTime: animation.currentTime, plays: animation.plays })),
        };
    }
    window.close();
    return result;
}

const fixturePath = path.resolve(process.argv[2]);
const results = Object.fromEntries(CASES.map((testCase) => [testCase.name, runCase(testCase)]));
if (process.env.STORY_PROGRESS_RECORD === '1') {
    fs.writeFileSync(fixturePath, JSON.stringify(results, null, 2) + '\n');
    console.log(`recorded ${CASES.length} cases -> ${fixturePath}`);
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
