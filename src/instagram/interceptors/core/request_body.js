/* Media Downloader - Request Body Normalizer (MAIN world)
 * Turns every shape fetch/XHR/sendBeacon/WebSocket accept into inspectable text.
 * Previously `(body || "").toString()` turned FormData/Blob/Request into
 * "[object ...]", letting seen/presence requests with those shapes slip through. */

/** Seen/presence payloads are a few KB; bigger bodies are uploads and are never inspected. */
const MAX_INSPECTABLE_BODY_BYTES = 256 * 1024;

const utf8Decoder = new TextDecoder('utf-8');

/**
 * @param {unknown} input - string | URL | Request | anything stringifiable
 * @returns {string}
 */
export function normalizeRequestUrl(input) {
    if (typeof input === 'string') return input;
    if (input instanceof URL) return input.href;
    if (typeof Request !== 'undefined' && input instanceof Request) return input.url;
    if (input === null || input === undefined) return '';
    return String(input);
}

/**
 * @param {Uint8Array} bytes
 * @returns {string}
 */
function decodeBytes(bytes) {
    if (bytes.byteLength > MAX_INSPECTABLE_BODY_BYTES) return '';
    return utf8Decoder.decode(bytes);
}

/**
 * Raw `key=value` pairs (not URL-encoded) so substring markers stay matchable.
 * @param {FormData} formData
 * @returns {string}
 */
function serializeFormData(formData) {
    /** @type {string[]} */
    const parts = [];
    for (const [key, value] of formData.entries()) {
        if (typeof value === 'string') parts.push(`${key}=${value}`);
    }
    return parts.join('&');
}

/**
 * Synchronous extraction.
 * @param {unknown} body
 * @returns {string | null} text, or null when the body can only be read asynchronously (small Blob)
 */
export function readBodyTextSync(body) {
    if (body === null || body === undefined) return '';
    if (typeof body === 'string') return body;
    if (body instanceof URLSearchParams) return body.toString();
    if (body instanceof FormData) return serializeFormData(body);
    if (body instanceof ArrayBuffer) return decodeBytes(new Uint8Array(body));
    if (ArrayBuffer.isView(body)) return decodeBytes(new Uint8Array(body.buffer, body.byteOffset, body.byteLength));
    if (body instanceof Blob) return body.size > MAX_INSPECTABLE_BODY_BYTES ? '' : null;
    // A ReadableStream cannot be inspected without consuming it, and a Document is never a seen payload.
    if (typeof ReadableStream !== 'undefined' && body instanceof ReadableStream) return '';
    if (typeof Document !== 'undefined' && body instanceof Document) return '';
    return String(body);
}

/**
 * @param {unknown} body
 * @returns {Promise<string>}
 */
export async function readBodyTextAsync(body) {
    const syncText = readBodyTextSync(body);
    if (syncText !== null) return syncText;
    return await /** @type {Blob} */ (body).text();
}

/**
 * Body of a fetch() call: `init.body` takes precedence, otherwise the Request's own body.
 * @param {unknown} input
 * @param {RequestInit | undefined} init
 * @returns {Promise<string>}
 */
export async function readFetchBodyText(input, init) {
    if (init && init.body !== null && init.body !== undefined) return readBodyTextAsync(init.body);
    if (typeof Request !== 'undefined' && input instanceof Request && input.method !== 'GET' && input.method !== 'HEAD') {
        // Clone so the page's own fetch can still consume the original body.
        const blob = await input.clone().blob();
        return blob.size > MAX_INSPECTABLE_BODY_BYTES ? '' : await blob.text();
    }
    return '';
}

/**
 * WebSocket frames (MQTT on Instagram) — Blob frames cannot be read synchronously.
 * @param {unknown} data
 * @returns {string | null} decoded text, or null when not synchronously decodable
 */
export function decodeWebSocketPayload(data) {
    if (typeof data === 'string') return data;
    if (data instanceof ArrayBuffer) return decodeBytes(new Uint8Array(data));
    if (ArrayBuffer.isView(data)) return decodeBytes(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
    return null;
}
