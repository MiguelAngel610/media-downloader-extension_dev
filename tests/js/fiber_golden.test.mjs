// Golden master for the Instagram fiber search: every case's MD_FIBER_RESULT must match the recording
// made from the original single-function implementation (tests/js/fixtures/fiber_golden.json).
// Run with FIBER_RECORD=1 to (re)record the fixture — only ever do that from a known-good implementation.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { buildCases } from './fiber_cases.mjs';

const listeners = [];
const posted = [];
const elements = {};
const body = { isBody: true };
globalThis.window = globalThis;
globalThis.addEventListener = (type, fn) => { if (type === 'message') listeners.push(fn); };
globalThis.postMessage = (data) => posted.push(data);
globalThis.document = {
    body,
    querySelector: (selector) => elements[(selector.match(/data-md-id="([^"]+)"/) || [])[1]] || null,
};
const silenced = [];
console.warn = (...args) => silenced.push(args.join(' ')); // logErrorOnce output is expected for the throwing-getter case

await import('../../src/instagram/interceptors/media/fiber_search.js');

/** Builds a fake DOM element exposing React's private keys like the real page does. */
function makeElement(spec, id) {
    if (!spec) return null;
    const element = { parentElement: spec.parent ? makeElement(spec.parent) : body };
    if (spec.fiber !== undefined) element['__reactFiber$test'] = spec.fiber;
    if (spec.reactProps) element['__reactProps$test'] = spec.reactProps;
    const article = spec.article ? makeElement(spec.article) : null;
    element.closest = () => article;
    if (id) elements[id] = element;
    return element;
}

const results = {};
for (const testCase of buildCases()) {
    const id = `case_${testCase.name}`;
    makeElement(testCase.element, id);
    window.__initialData = testCase.initialData;
    posted.length = 0;
    for (const fn of listeners) fn({ source: window, data: { type: 'MD_REQUEST_FIBER', id, ...testCase.request } });
    results[testCase.name] = posted.filter((m) => m.type === 'MD_FIBER_RESULT');
}

// Passed by tests/run_all.mjs: the test itself runs from a temporary esbuild bundle.
const fixturePath = path.resolve(process.argv[2]);
if (process.env.FIBER_RECORD === '1') {
    writeFileSync(fixturePath, JSON.stringify(results, null, 2) + '\n');
    console.log(`recorded ${Object.keys(results).length} cases -> ${fixturePath}`);
    process.exit(0);
}
const golden = JSON.parse(readFileSync(fixturePath, 'utf8'));
let failed = 0;
for (const name of Object.keys(golden)) {
    const same = JSON.stringify(results[name]) === JSON.stringify(golden[name]);
    if (!same) failed++;
    console.log(`${same ? 'PASS' : 'FAIL'}  ${name}`);
    if (!same) console.log(`      expected ${JSON.stringify(golden[name])}\n      actual   ${JSON.stringify(results[name])}`);
}
console.log(`\n${Object.keys(golden).length - failed}/${Object.keys(golden).length} passed`);
process.exit(failed ? 1 : 0);
