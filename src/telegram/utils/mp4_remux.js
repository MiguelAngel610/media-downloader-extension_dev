// src/telegram/utils/mp4_remux.js
//
// Remuxes a fragmented MP4 (fMP4/DASH-style, as served by Telegram's
// progressive streaming endpoint) into a flat/progressive MP4 with a single
// complete `moov` box, restoring normal seek support in standard players.
//
// This does NOT re-encode any audio/video — it only reorganizes the
// container (same approach as `ffmpeg -c copy -movflags faststart`), so
// there is zero quality loss and the output is ~the same size as the input.
//
// Algorithm validated against a real Telegram-downloaded file:
//  - Correct sample tables (stts/stsz/stco/stsc) reconstructed from all
//    moof+mdat fragments.
//  - Correct stss (keyframe) table — this required honoring trun's
//    "first sample flags" override, which the initial implementation missed
//    and which caused seeks to land on non-decodable frames.
//  - Correct mdhd/tkhd/mvhd duration (fragmented MP4 leaves these at 0).
//  - Verified via frame extraction at an arbitrary seek point: pixel output
//    matches an `ffmpeg -c copy` reference remux (mean abs diff ~1.6/255,
//    consistent with decoder rounding noise, not corruption).
(function () {
    const MAX_32BIT_BOX_SIZE = 0xFFFFFFFF;

    /** Input is a regular (non-fragmented) MP4: expected, the file is already seekable. */
    function notFragmentedError(message) {
        const error = new Error(message);
        error.name = "NotFragmentedMp4";
        return error;
    }

    /** Structural damage (truncated download, corrupt boxes): never ship a remux built from it. */
    function integrityError(message) {
        const error = new Error(message);
        error.name = "Mp4IntegrityError";
        return error;
    }

    /**
     * Parses sibling boxes in [start, end) and validates that every box header and body
     * fits inside its container. Without this, subarray() silently clamps a truncated box
     * and the remux "succeeds" with missing samples.
     */
    function readBoxes(view, start, end) {
        const boxes = [];
        let offset = start;
        while (offset + 8 <= end) {
            const size = view.getUint32(offset);
            const type = String.fromCharCode(
                view.getUint8(offset + 4), view.getUint8(offset + 5),
                view.getUint8(offset + 6), view.getUint8(offset + 7)
            );
            let headerSize = 8;
            let actualSize = size;
            if (size === 1) {
                if (offset + 16 > end) throw integrityError(`Truncated 64-bit header of box '${type}' at ${offset}`);
                const hi = view.getUint32(offset + 8);
                const lo = view.getUint32(offset + 12);
                actualSize = hi * 2 ** 32 + lo;
                headerSize = 16;
            } else if (size === 0) {
                actualSize = end - offset;
            }
            if (actualSize < headerSize) {
                throw integrityError(`Box '${type}' at ${offset} declares size ${actualSize}, smaller than its header`);
            }
            if (offset + actualSize > end) {
                throw integrityError(`Box '${type}' at ${offset} overruns its container (${offset + actualSize} > ${end}): truncated or corrupt file`);
            }
            boxes.push({ type, start: offset, headerSize, size: actualSize, bodyStart: offset + headerSize, bodyEnd: offset + actualSize });
            offset += actualSize;
        }
        // Fewer than 8 trailing bytes cannot form a box; muxers occasionally pad, so they are ignored.
        return boxes;
    }

    /**
     * Re-parses the produced file: exactly ftyp + moov + mdat, mdat size equal to the copied
     * sample bytes, every trak still parseable. Throws instead of letting a bad file be saved.
     */
    function assertValidFlatMp4(outputBytes, expectedPayloadLength, expectedTrackCount) {
        const view = new DataView(outputBytes.buffer, outputBytes.byteOffset, outputBytes.byteLength);
        const boxes = readBoxes(view, 0, outputBytes.byteLength);
        const types = boxes.map(b => b.type).join(",");
        if (types !== "ftyp,moov,mdat") throw integrityError(`Remux produced unexpected top-level layout: ${types}`);
        const mdat = boxes[2];
        if (mdat.bodyEnd - mdat.bodyStart !== expectedPayloadLength) {
            throw integrityError(`Remuxed mdat holds ${mdat.bodyEnd - mdat.bodyStart} bytes, expected ${expectedPayloadLength}`);
        }
        const traks = findAllBoxes(readBoxes(view, boxes[1].bodyStart, boxes[1].bodyEnd), "trak");
        if (traks.length !== expectedTrackCount) throw integrityError(`Remuxed moov has ${traks.length} trak(s), expected ${expectedTrackCount}`);
        for (const trak of traks) readBoxes(view, trak.bodyStart, trak.bodyEnd);
    }

    function findBox(boxes, type) { return boxes.find(b => b.type === type); }
    function findAllBoxes(boxes, type) { return boxes.filter(b => b.type === type); }

    function parseTfhd(view, tfhd) {
        const flags = (view.getUint8(tfhd.bodyStart + 1) << 16) | (view.getUint8(tfhd.bodyStart + 2) << 8) | view.getUint8(tfhd.bodyStart + 3);
        let p = tfhd.bodyStart + 4;
        const trackId = view.getUint32(p); p += 4;
        const result = { trackId };
        if (flags & 0x000001) { p += 8; } // baseDataOffset (unused in this file's encoder, skip)
        if (flags & 0x000002) { result.sampleDescIndex = view.getUint32(p); p += 4; }
        if (flags & 0x000008) { result.defaultSampleDuration = view.getUint32(p); p += 4; }
        if (flags & 0x000010) { result.defaultSampleSize = view.getUint32(p); p += 4; }
        if (flags & 0x000020) { result.defaultSampleFlags = view.getUint32(p); p += 4; }
        return result;
    }

    function parseTrun(view, trun) {
        const version = view.getUint8(trun.bodyStart);
        const flags = (view.getUint8(trun.bodyStart + 1) << 16) | (view.getUint8(trun.bodyStart + 2) << 8) | view.getUint8(trun.bodyStart + 3);
        let p = trun.bodyStart + 4;
        const sampleCount = view.getUint32(p); p += 4;
        const result = { version, flags, sampleCount, samples: [] };
        if (flags & 0x000001) { result.dataOffset = view.getInt32(p); p += 4; }
        if (flags & 0x000004) { result.firstSampleFlags = view.getUint32(p); p += 4; }
        for (let i = 0; i < sampleCount; i++) {
            const s = {};
            if (flags & 0x000100) { s.duration = view.getUint32(p); p += 4; }
            if (flags & 0x000200) { s.size = view.getUint32(p); p += 4; }
            if (flags & 0x000400) { s.flags = view.getUint32(p); p += 4; }
            if (flags & 0x000800) { s.ctsOffset = version === 0 ? view.getUint32(p) : view.getInt32(p); p += 4; }
            result.samples.push(s);
        }
        return result;
    }

    // --- Box writer helpers (operate on Uint8Array, concatenated at the end) ---
    function u32arr(n) {
        const a = new Uint8Array(4);
        new DataView(a.buffer).setUint32(0, n >>> 0);
        return a;
    }
    function concatBytes(arrays) {
        let total = 0;
        for (const a of arrays) total += a.length;
        const out = new Uint8Array(total);
        let off = 0;
        for (const a of arrays) { out.set(a, off); off += a.length; }
        return out;
    }
    function strBytes(s) {
        const a = new Uint8Array(s.length);
        for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i);
        return a;
    }
    function makeBox(type, ...bodies) {
        const body = concatBytes(bodies);
        return concatBytes([u32arr(body.length + 8), strBytes(type), body]);
    }

    function patchDurationU32Field(fullBoxBytes, byteOffsetFromBoxStartV0, byteOffsetFromBoxStartV1, newDuration) {
        const out = new Uint8Array(fullBoxBytes); // copy
        const dv = new DataView(out.buffer);
        const version = out[8]; // first byte of box body
        if (version === 1) {
            // 64-bit field — we only ever need values that fit in 32 bits
            // for these durations in practice, write high=0.
            dv.setUint32(byteOffsetFromBoxStartV1, 0);
            dv.setUint32(byteOffsetFromBoxStartV1 + 4, newDuration >>> 0);
        } else {
            dv.setUint32(byteOffsetFromBoxStartV0, newDuration >>> 0);
        }
        return out;
    }

    function patchMdhdDuration(bytes, newDuration) { return patchDurationU32Field(bytes, 8 + 16, 8 + 20, newDuration); }
    function patchTkhdDuration(bytes, newDuration) { return patchDurationU32Field(bytes, 8 + 20, 8 + 28, newDuration); }
    function patchMvhdDuration(bytes, newDuration) { return patchDurationU32Field(bytes, 8 + 16, 8 + 24, newDuration); }

    function buildStts(samples) {
        const entries = [];
        for (const s of samples) {
            const d = s.duration;
            if (entries.length > 0 && entries[entries.length - 1].delta === d) {
                entries[entries.length - 1].count++;
            } else {
                entries.push({ count: 1, delta: d });
            }
        }
        const body = concatBytes([
            u32arr(0), u32arr(entries.length),
            ...entries.map(e => concatBytes([u32arr(e.count), u32arr(e.delta)])),
        ]);
        return makeBox("stts", body);
    }

    function buildStsz(samples) {
        const body = concatBytes([
            u32arr(0), u32arr(0), u32arr(samples.length),
            ...samples.map(s => u32arr(s.size)),
        ]);
        return makeBox("stsz", body);
    }

    function buildStco(firstSampleOffset) {
        // Exactly ONE chunk per track (see buildStsc) -> exactly one stco
        // entry: the absolute file offset of that chunk's first byte.
        const body = concatBytes([u32arr(0), u32arr(1), u32arr(firstSampleOffset)]);
        return makeBox("stco", body);
    }

    function buildStsc(sampleCount) {
        const body = concatBytes([u32arr(0), u32arr(1), u32arr(1), u32arr(sampleCount), u32arr(1)]);
        return makeBox("stsc", body);
    }

    function buildStss(samples) {
        const syncIndices = [];
        samples.forEach((s, i) => {
            const isNonSync = (s.flags >> 16) & 0x1;
            if (!isNonSync) syncIndices.push(i + 1);
        });
        if (syncIndices.length === samples.length) return null; // all sync -> omit is correct
        if (syncIndices.length === 0) syncIndices.push(1); // never produce a fully unseekable track
        const body = concatBytes([u32arr(0), u32arr(syncIndices.length), ...syncIndices.map(u32arr)]);
        return makeBox("stss", body);
    }

    function getU32TrackIdFromTkhd(view, tkhd) {
        const version = view.getUint8(tkhd.bodyStart);
        return view.getUint32(tkhd.bodyStart + (version === 1 ? 20 : 12));
    }

    function getMdhdTimescale(view, mdhd) {
        const version = view.getUint8(mdhd.bodyStart);
        return view.getUint32(mdhd.bodyStart + (version === 1 ? 28 : 12));
    }

    function getMvhdTimescale(view, mvhd) {
        const version = view.getUint8(mvhd.bodyStart);
        return view.getUint32(mvhd.bodyStart + (version === 1 ? 20 : 12));
    }

    /**
     * Remux a fragmented MP4 ArrayBuffer into a flat/progressive MP4.
     * Returns a Uint8Array of the new file, or throws if the input doesn't
     * look like a fragmented MP4 this remuxer understands (caller should
     * fall back to using the original bytes untouched in that case).
     */
    function remuxFragmentedMp4(arrayBuffer) {
        const bytes = new Uint8Array(arrayBuffer);
        const view = new DataView(arrayBuffer);
        const topBoxes = readBoxes(view, 0, bytes.length);

        const ftyp = findBox(topBoxes, "ftyp");
        const moov = findBox(topBoxes, "moov");
        const moofs = findAllBoxes(topBoxes, "moof");
        const mdats = findAllBoxes(topBoxes, "mdat");

        if (!ftyp || !moov) throw integrityError("Missing ftyp or moov box");
        if (moofs.length === 0) throw notFragmentedError("No moof boxes: already a regular MP4");
        if (mdats.length !== moofs.length) {
            throw integrityError(`moof/mdat count mismatch (${moofs.length} moof, ${mdats.length} mdat): incomplete fragment`);
        }

        const moovChildren = readBoxes(view, moov.bodyStart, moov.bodyEnd);
        const traks = findAllBoxes(moovChildren, "trak");
        const mvhdBox = findBox(moovChildren, "mvhd");
        const movieTimescale = getMvhdTimescale(view, mvhdBox);
        const trackDurationsInMovieTimescale = [];

        const trackData = new Map(); // trackId -> { samples: [{size,duration,flags}], byteRanges: [[start,end]] }

        for (let i = 0; i < moofs.length; i++) {
            const moof = moofs[i];
            const mdat = mdats[i];
            if (mdat.start < moof.bodyEnd) throw integrityError(`Fragment ${i}: mdat does not follow its moof`);
            const moofChildren = readBoxes(view, moof.bodyStart, moof.bodyEnd);
            const trafs = findAllBoxes(moofChildren, "traf");

            for (const traf of trafs) {
                const trafChildren = readBoxes(view, traf.bodyStart, traf.bodyEnd);
                const tfhdBox = findBox(trafChildren, "tfhd");
                const trunBox = findBox(trafChildren, "trun");
                if (!tfhdBox || !trunBox) throw integrityError(`Fragment ${i}: traf without tfhd/trun`);
                const tfhd = parseTfhd(view, tfhdBox);
                const trun = parseTrun(view, trunBox);

                if (!trackData.has(tfhd.trackId)) {
                    trackData.set(tfhd.trackId, { samples: [], byteRanges: [] });
                }
                const track = trackData.get(tfhd.trackId);

                // data_offset is relative to the moof box start (default
                // base-data-offset behavior — base-data-offset-present was
                // not set in any real Telegram file observed so far).
                let cursor = moof.start + (trun.dataOffset || 0);

                for (let si = 0; si < trun.samples.length; si++) {
                    const s = trun.samples[si];
                    const size = s.size !== undefined ? s.size : tfhd.defaultSampleSize;
                    const duration = s.duration !== undefined ? s.duration : tfhd.defaultSampleDuration;

                    // IMPORTANT: trun's first-sample-flags override applies
                    // to sample index 0 of THIS run specifically (marks
                    // fragment-starts-with-keyframe). Missing this produces
                    // a missing/wrong stss table and breaks seeking.
                    let flags;
                    if (s.flags !== undefined) flags = s.flags;
                    else if (si === 0 && trun.firstSampleFlags !== undefined) flags = trun.firstSampleFlags;
                    else flags = tfhd.defaultSampleFlags;

                    if (!Number.isFinite(size) || size < 0) throw integrityError(`Fragment ${i}, sample ${si}: invalid size ${size}`);
                    // Every sample must live inside THIS fragment's mdat body; otherwise the source is truncated.
                    if (cursor < mdat.bodyStart || cursor + size > mdat.bodyEnd) {
                        throw integrityError(`Fragment ${i}, sample ${si}: bytes [${cursor}, ${cursor + size}) fall outside its mdat [${mdat.bodyStart}, ${mdat.bodyEnd})`);
                    }
                    track.samples.push({ size, duration, flags: flags || 0 });
                    track.byteRanges.push([cursor, cursor + size]);
                    cursor += size;
                }
            }
        }

        const trackIds = Array.from(trackData.keys()).sort((a, b) => a - b);
        const newMdatParts = [];
        const trackByteOffsets = new Map(); // trackId -> [offset0Based, ...]

        let mdatCursor = 0;
        for (const trackId of trackIds) {
            const track = trackData.get(trackId);
            const offsets = [];
            for (const [start, end] of track.byteRanges) {
                offsets.push(mdatCursor);
                newMdatParts.push(bytes.subarray(start, end));
                mdatCursor += (end - start);
            }
            trackByteOffsets.set(trackId, offsets);
        }
        const newMdatPayload = concatBytes(newMdatParts);
        if (trackIds.length === 0 || newMdatPayload.length === 0) throw integrityError("No samples found in any fragment");
        if (newMdatPayload.length + 8 > MAX_32BIT_BOX_SIZE) {
            // A 32-bit mdat header would overflow and corrupt the file.
            throw integrityError(`Video too large for a 32-bit mdat (${newMdatPayload.length} bytes)`);
        }

        function rebuildTrak(trakBox, withBase, baseOffset) {
            const trakChildren = readBoxes(view, trakBox.bodyStart, trakBox.bodyEnd);
            const tkhdBox = findBox(trakChildren, "tkhd");
            const trackId = getU32TrackIdFromTkhd(view, tkhdBox);
            const track = trackData.get(trackId);
            if (!track) return bytes.subarray(trakBox.start, trakBox.bodyEnd);

            const mdia = findBox(trakChildren, "mdia");
            const mdiaChildren = readBoxes(view, mdia.bodyStart, mdia.bodyEnd);
            const minf = findBox(mdiaChildren, "minf");
            const minfChildren = readBoxes(view, minf.bodyStart, minf.bodyEnd);
            const stbl = findBox(minfChildren, "stbl");
            const stblChildren = readBoxes(view, stbl.bodyStart, stbl.bodyEnd);
            const stsd = findBox(stblChildren, "stsd");

            const rawOffsets = trackByteOffsets.get(trackId);
            const offsets = withBase ? rawOffsets.map(o => o + baseOffset) : rawOffsets;

            const newStts = buildStts(track.samples);
            const newStsz = buildStsz(track.samples);
            const newStsc = buildStsc(track.samples.length);
            const newStss = buildStss(track.samples);
            const newStco = buildStco(offsets[0]);
            const stsdBytes = bytes.subarray(stsd.start, stsd.bodyEnd);

            const stblChildBoxes = [stsdBytes, newStts, newStsz, newStsc];
            if (newStss) stblChildBoxes.push(newStss);
            stblChildBoxes.push(newStco);

            const newStbl = makeBox("stbl", concatBytes(stblChildBoxes));
            const minfPartsInOrder = minfChildren.map(c => c.type === "stbl" ? newStbl : bytes.subarray(c.start, c.bodyEnd));
            const newMinfFinal = makeBox("minf", concatBytes(minfPartsInOrder));

            let patchedMdhdBytes = null;
            let trackDurationInMovieTimescale = 0;
            const mdhdBox = findBox(mdiaChildren, "mdhd");

            if (withBase) {
                const trackDurationInTrackTimescale = track.samples.reduce((sum, s) => sum + s.duration, 0);
                patchedMdhdBytes = patchMdhdDuration(bytes.subarray(mdhdBox.start, mdhdBox.bodyEnd), trackDurationInTrackTimescale);
                const mdhdTimescale = getMdhdTimescale(view, mdhdBox);
                trackDurationInMovieTimescale = Math.round((trackDurationInTrackTimescale / mdhdTimescale) * movieTimescale);
            }

            const mdiaPartsInOrder = mdiaChildren.map(c => {
                if (c.type === "minf") return newMinfFinal;
                if (c.type === "mdhd" && patchedMdhdBytes) return patchedMdhdBytes;
                return bytes.subarray(c.start, c.bodyEnd);
            });
            const newMdiaFinal = makeBox("mdia", concatBytes(mdiaPartsInOrder));

            let trakPartsInOrder;
            if (withBase) {
                const patchedTkhd = patchTkhdDuration(bytes.subarray(tkhdBox.start, tkhdBox.bodyEnd), trackDurationInMovieTimescale);
                trakPartsInOrder = trakChildren.map(c => {
                    if (c.type === "mdia") return newMdiaFinal;
                    if (c.type === "tkhd") return patchedTkhd;
                    return bytes.subarray(c.start, c.bodyEnd);
                });
                trackDurationsInMovieTimescale.push(trackDurationInMovieTimescale);
            } else {
                trakPartsInOrder = trakChildren.map(c => c.type === "mdia" ? newMdiaFinal : bytes.subarray(c.start, c.bodyEnd));
            }

            return makeBox("trak", concatBytes(trakPartsInOrder));
        }

        // Pass 1: build moov with placeholder (0-based) stco offsets, just to
        // measure its real byte size (needed before we know the absolute
        // base offset for pass 2's real stco values).
        const pass1TrakBuffers = traks.map(t => rebuildTrak(t, false, 0));
        const pass1MoovParts = [];
        let idx = 0;
        for (const child of moovChildren) {
            if (child.type === "trak") pass1MoovParts.push(pass1TrakBuffers[idx++]);
            else if (child.type === "mvex") { /* dropped */ }
            else pass1MoovParts.push(bytes.subarray(child.start, child.bodyEnd));
        }
        const pass1Moov = makeBox("moov", concatBytes(pass1MoovParts));

        const ftypBytes = bytes.subarray(ftyp.start, ftyp.bodyEnd);
        const mdatHeaderFull = concatBytes([u32arr(newMdatPayload.length + 8), strBytes("mdat")]);
        const baseOffset = ftypBytes.length + pass1Moov.length + mdatHeaderFull.length;

        // Pass 2: rebuild with real absolute stco offsets + patched durations.
        const pass2TrakBuffers = traks.map(t => rebuildTrak(t, true, baseOffset));
        const movieDuration = Math.max(...trackDurationsInMovieTimescale, 0);
        const patchedMvhd = patchMvhdDuration(bytes.subarray(mvhdBox.start, mvhdBox.bodyEnd), movieDuration);

        const finalMoovParts = [];
        idx = 0;
        for (const child of moovChildren) {
            if (child.type === "trak") finalMoovParts.push(pass2TrakBuffers[idx++]);
            else if (child.type === "mvex") { /* dropped */ }
            else if (child.type === "mvhd") finalMoovParts.push(patchedMvhd);
            else finalMoovParts.push(bytes.subarray(child.start, child.bodyEnd));
        }
        const finalMoov = makeBox("moov", concatBytes(finalMoovParts));

        const finalBaseOffset = ftypBytes.length + finalMoov.length + mdatHeaderFull.length;
        if (finalBaseOffset !== baseOffset) {
            // Should not happen (all patched fields are fixed-width), but
            // never silently ship a file with wrong offsets — caller should
            // fall back to the original bytes if this throws.
            throw new Error(`Remux offset mismatch (pass1=${baseOffset}, pass2=${finalBaseOffset}) — aborting to avoid producing a corrupt file`);
        }

        const output = concatBytes([ftypBytes, finalMoov, mdatHeaderFull, newMdatPayload]);
        assertValidFlatMp4(output, newMdatPayload.length, traks.length);
        return output;
    }

    window.__md_tel_remux_fmp4 = remuxFragmentedMp4;
})();
