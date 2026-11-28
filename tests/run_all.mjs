// Runs every regression suite (JS + Python host) and fails if any test fails.
// Usage: npm test   (builds the bundles first)
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fromRoot = (...parts) => path.join(repoRoot, ...parts);
const scratchDir = mkdtempSync(path.join(tmpdir(), 'md_tests_'));

/** @returns {string | null} first executable found on PATH */
function findOnPath(...candidates) {
    const locator = process.platform === 'win32' ? 'where' : 'which';
    for (const candidate of candidates) {
        const result = spawnSync(locator, [candidate], { encoding: 'utf8' });
        if (result.status === 0) return result.stdout.split(/\r?\n/)[0].trim();
    }
    return null;
}

const python = findOnPath('py', 'python3', 'python');
const ffmpeg = process.env.FFMPEG_DIR ? path.join(process.env.FFMPEG_DIR, 'ffmpeg') : findOnPath('ffmpeg');

/** @typedef {{ name: string, command: string, args: string[], cwd?: string, skip?: string }} Suite */

/** @returns {Promise<Suite[]>} */
async function buildSuites() {
    const qualityBundle = path.join(scratchDir, 'quality_main_world.bundle.mjs');
    await esbuild.build({ entryPoints: [fromRoot('tests/js/quality_main_world.test.mjs')], bundle: true, platform: 'node', format: 'esm', outfile: qualityBundle, logLevel: 'error' });

    const fiberBundle = path.join(scratchDir, 'fiber_golden.bundle.mjs');
    await esbuild.build({ entryPoints: [fromRoot('tests/js/fiber_golden.test.mjs')], bundle: true, platform: 'node', format: 'esm', outfile: fiberBundle, logLevel: 'error' });

    const remuxDir = mkdtempSync(path.join(scratchDir, 'remux_'));
    let remuxSkip = ffmpeg ? '' : 'ffmpeg not found on PATH (set FFMPEG_DIR to enable)';
    if (ffmpeg) {
        const run = (args) => execFileSync(ffmpeg, ['-v', 'error', '-y', ...args], { cwd: remuxDir });
        run(['-f', 'lavfi', '-i', 'testsrc=duration=4:size=640x360:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=4',
            '-c:v', 'libx264', '-g', '30', '-c:a', 'aac', '-shortest', '-movflags', 'frag_keyframe+empty_moov+default_base_moof', '-f', 'mp4', 'frag.mp4']);
        run(['-f', 'lavfi', '-i', 'testsrc=duration=2:size=320x240:rate=30', '-c:v', 'libx264', 'flat.mp4']);
    }
    const pythonSkip = python ? '' : 'Python not found on PATH';
    const host = fromRoot('host/host.py');
    return [
        { name: 'IG ghost mode (bundle)', command: 'node', args: [fromRoot('tests/js/ghost_mode.test.js'), fromRoot('dist/ig_interceptor.bundle.js')] },
        { name: 'IG media quality (MAIN world)', command: 'node', args: [qualityBundle] },
        { name: 'IG fiber search (golden)', command: 'node', args: [fiberBundle, fromRoot('tests/js/fixtures/fiber_golden.json')] },
        { name: 'IG download request (golden)', command: 'node', args: [fromRoot('tests/js/download_request_golden.test.js'), fromRoot('tests/js/fixtures/download_request_golden.json')] },
        { name: 'IG media resolver (golden)', command: 'node', args: [fromRoot('tests/js/media_resolver_golden.test.js'), fromRoot('tests/js/fixtures/media_resolver_golden.json')] },
        { name: 'IG shared post detection (golden)', command: 'node', args: [fromRoot('tests/js/shared_post_golden.test.js'), fromRoot('tests/js/fixtures/shared_post_golden.json')] },
        { name: 'IG story button (golden)', command: 'node', args: [fromRoot('tests/js/story_button_golden.test.js'), fromRoot('tests/js/fixtures/story_button_golden.json')] },
        { name: 'IG story progress bar (golden)', command: 'node', args: [fromRoot('tests/js/story_progress_golden.test.js'), fromRoot('tests/js/fixtures/story_progress_golden.json')] },
        { name: 'IG synthetic input never downloads', command: 'node', args: [fromRoot('tests/js/synthetic_input.test.js')] },
        { name: 'IG profile pic + X images (DOM)', command: 'node', args: [fromRoot('tests/js/quality_dom.test.js'), fromRoot('src/instagram/utils/pfp_resolver.js'), fromRoot('src/x/x_buttons.js')] },
        { name: 'Toast/popup XSS', command: 'node', args: [fromRoot('tests/js/toast_xss.test.js'), fromRoot('src/shared/utils/toast_manager.js'), fromRoot('src/popup/popup.js')] },
        { name: 'Service worker', command: 'node', args: [fromRoot('tests/js/service_worker.test.js'), repoRoot] },
        { name: 'Telegram MP4 remux (ffmpeg)', command: 'node', args: [fromRoot('tests/js/remux.test.js'), fromRoot('src/telegram/utils/mp4_remux.js'), ffmpeg ? path.dirname(ffmpeg) : '', 'repo'], cwd: remuxDir, skip: remuxSkip },
        { name: 'Host security (path/TCP/stdout)', command: python, args: [fromRoot('tests/host/test_security.py'), host], skip: pythonSkip },
        { name: 'Host command injection', command: python, args: [fromRoot('tests/host/test_injection.py'), host, scratchDir], skip: pythonSkip },
        { name: 'Host direct downloads', command: python, args: [fromRoot('tests/host/test_direct_download.py'), host], skip: pythonSkip },
        { name: 'Host routing equivalence (golden)', command: python, args: [fromRoot('tests/host/test_routing_equivalence.py'), host], skip: pythonSkip },
        { name: 'Host native protocol', command: python, args: [fromRoot('tests/host/test_protocol.py'), host], skip: pythonSkip },
    ];
}

const suites = await buildSuites();
let failed = 0;
for (const suite of suites) {
    if (suite.skip) {
        console.log(`SKIP  ${suite.name} — ${suite.skip}`);
        continue;
    }
    const result = spawnSync(suite.command, suite.args, { cwd: suite.cwd || repoRoot, encoding: 'utf8', timeout: 180000 });
    const output = `${result.stdout || ''}${result.stderr || ''}`;
    const summary = (output.match(/\d+\/\d+ passed/g) || ['no summary']).pop();
    const ok = result.status === 0 && !/^FAIL/m.test(output);
    if (!ok) failed++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${suite.name.padEnd(36)} ${summary}`);
    if (!ok) console.log(output.split(/\r?\n/).filter((l) => /FAIL|Error/.test(l)).slice(0, 15).map((l) => `      ${l}`).join('\n'));
}
if (!existsSync(fromRoot('dist/ig_interceptor.bundle.js'))) console.log('WARN  dist bundles missing: run npm run build');
console.log(failed ? `\n${failed} suite(s) failed` : '\nAll suites passed');
process.exit(failed ? 1 : 0);
