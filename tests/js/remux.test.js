// Real-file test for mp4_remux.js: remux ffmpeg-generated fMP4, then verify with ffprobe/ffmpeg.
const fs = require('fs');
const vm = require('vm');
const { execFileSync } = require('child_process');
const [remuxPath, ffDir, label] = process.argv.slice(2);

function loadRemux(file) {
    const ctx = { window: {}, DataView, Uint8Array, ArrayBuffer, Math, Number, String, Error, Map, Array, Object };
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(file, 'utf8'), ctx);
    return ctx.window.__md_tel_remux_fmp4;
}
const remux = loadRemux(remuxPath);
const toArrayBuffer = (buf) => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
const ffprobe = (file, args) => execFileSync(`${ffDir}/ffprobe.exe`, ['-v', 'error', ...args, file]).toString().trim();
const decodeErrors = (file, extra = []) => {
    try {
        execFileSync(`${ffDir}/ffmpeg.exe`, ['-v', 'error', ...extra, '-i', file, '-f', 'null', '-'], { stdio: ['ignore', 'ignore', 'pipe'] });
        return '';
    } catch (err) { return String(err.stderr || err.message); }
};
const results = [];
const check = (name, ok) => results.push([ok ? 'PASS' : 'FAIL', name]);
const attempt = (buf) => { try { return { out: remux(toArrayBuffer(buf)) }; } catch (err) { return { err }; } };

const frag = fs.readFileSync('frag.mp4');
const ok = attempt(frag);
check(`${label} R1 fragmented MP4 remuxes without error`, ok.out && !ok.err);
if (ok.out) {
    fs.writeFileSync(`out_${label}.mp4`, Buffer.from(ok.out));
    const dur = parseFloat(ffprobe(`out_${label}.mp4`, ['-show_entries', 'format=duration', '-of', 'csv=p=0']));
    const frames = parseInt(ffprobe(`out_${label}.mp4`, ['-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=nb_read_frames', '-of', 'csv=p=0']), 10);
    const streams = ffprobe(`out_${label}.mp4`, ['-show_entries', 'stream=codec_type', '-of', 'csv=p=0']).split(/\r?\n/).sort().join(',');
    check(`${label} R2 duration restored (~4s, fMP4 has 0 in moov)`, Math.abs(dur - 4) < 0.2);
    check(`${label} R3 all 120 video frames present`, frames === 120);
    check(`${label} R4 audio + video tracks kept`, streams === 'audio,video');
    check(`${label} R5 full decode has no errors`, decodeErrors(`out_${label}.mp4`) === '');
    check(`${label} R6 seek to 2.5s decodes`, decodeErrors(`out_${label}.mp4`, ['-ss', '2.5']) === '');
}
const truncated = frag.subarray(0, Math.floor(frag.length * 0.7));
const bad = attempt(truncated);
check(`${label} R7 truncated download is REJECTED (not silently remuxed)`, bad.err && bad.err.name === 'Mp4IntegrityError');
if (bad.err) console.log(`      -> ${bad.err.name}: ${bad.err.message}`);
if (bad.out) console.log(`      -> produced ${bad.out.length} bytes from a truncated input`);
const flat = attempt(fs.readFileSync('flat.mp4'));
check(`${label} R8 regular MP4 -> NotFragmentedMp4 (expected, not an error)`, flat.err && flat.err.name === 'NotFragmentedMp4');

for (const [s, n] of results) console.log(`${s}  ${n}`);
console.log(`\n${results.filter(([s]) => s === 'PASS').length}/${results.length} passed`);
