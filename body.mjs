/**
 * Body parsing and response utilities for leserve handlers.
 *
 * Parsing:
 *   json(request, options?)  — parse JSON body
 *   text(request, options?)  — parse text body
 *   form(request)            — parse FormData body
 *   buffer(request)          — parse ArrayBuffer body
 *
 * Responses:
 *   respond(data, options?)  — JSON response
 *   redirect(url, status?)   — redirect response
 *   error(message, status?)  — JSON error response
 */

// ── Request body parsing ────────────────────────────────────────────

/**
 * Read a request body as an ArrayBuffer, aborting as soon as more than
 * `limit` bytes have arrived instead of buffering the whole body first.
 *
 * `request.arrayBuffer()` fully drains and buffers the entire body before
 * anyone gets a chance to look at its size, which defeats the purpose of a
 * `limit` for exactly the case it exists to guard against — a large or
 * DoS-sized payload. This reads the body's stream chunk by chunk, tracks
 * the running total, and cancels the reader the moment the limit is
 * exceeded so the rest of the body is never received or held in memory.
 *
 * @private
 * @param {Request} request
 * @param {number} limit
 * @returns {Promise<ArrayBuffer>}
 */
const readLimited = async (request, limit) => {
  if (!request.body) return new ArrayBuffer(0);
  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel().catch(() => {});
      throw Object.assign(new Error("Payload too large"), { status: 413 });
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out.buffer;
};

/**
 * Parse request body as JSON.
 * @param {Request} request
 * @param {Object} [options]
 * @param {number} [options.limit] - Max body size in bytes (413 if exceeded)
 * @returns {Promise<any>}
 */
export const json = async (request, { limit } = {}) => {
  if (limit) {
    const buf = await readLimited(request, limit);
    return JSON.parse(new TextDecoder().decode(buf));
  }
  return request.json();
};

/**
 * Parse request body as text.
 * @param {Request} request
 * @param {Object} [options]
 * @param {number} [options.limit] - Max body size in bytes (413 if exceeded)
 * @returns {Promise<string>}
 */
export const text = async (request, { limit } = {}) => {
  if (limit) {
    const buf = await readLimited(request, limit);
    return new TextDecoder().decode(buf);
  }
  return request.text();
};

/**
 * Parse request body as FormData.
 * @param {Request} request
 * @returns {Promise<FormData>}
 */
export const form = (request) => request.formData();

/**
 * Parse request body as ArrayBuffer.
 * @param {Request} request
 * @returns {Promise<ArrayBuffer>}
 */
export const buffer = (request) => request.arrayBuffer();

// ── Response helpers ────────────────────────────────────────────────

/**
 * Create a JSON response.
 * @param {any} data - Serializable data
 * @param {Object} [options]
 * @param {number} [options.status=200]
 * @param {Object} [options.headers] - Additional headers
 * @returns {Response}
 */
export const respond = (data, { status = 200, headers = {} } = {}) => {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
};

/**
 * Create a redirect response.
 * @param {string} url
 * @param {number} [status=302]
 * @returns {Response}
 */
export const redirect = (url, status = 302) => {
  return new Response(null, {
    status,
    headers: { location: url },
  });
};

/**
 * Create a JSON error response.
 * @param {string} message
 * @param {number} [status=500]
 * @returns {Response}
 */
export const error = (message, status = 500) => {
  return respond({ error: message }, { status });
};
