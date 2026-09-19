/**
 * Convert a Node.js `http`/`https` `IncomingMessage` into a standard Web
 * API `Request`.
 *
 * Used by both `serve.mjs` (the `serve()` handler-based server) and
 * `controls.mjs` (the event-based `start()`/`use()`/`route()` server) so the
 * conversion logic — URL construction, header copying, and the
 * `duplex: "half"` body-streaming requirement — lives in exactly one place.
 *
 * Also published as `leserve/node-request` for other packages that need
 * their own Node HTTP bridge to speak the same `Request` shape leserve
 * itself produces (e.g. `@johnhenry/servable`'s Node adapter).
 */

/**
 * @param {import('http').IncomingMessage} req
 * @param {Object} [options]
 * @param {boolean} [options.attachRaw=false] - If true, attach the original
 *   `IncomingMessage` to the returned `Request` as a non-enumerable `raw`
 *   property (used by `serve.mjs` so middleware such as `onWebSocket()` can
 *   reach the underlying socket for upgrades).
 * @returns {Request}
 */
export const toWebRequest = (req, { attachRaw = false } = {}) => {
  // `Host` is required by HTTP/1.1 but a client can still omit it (HTTP/1.0,
  // or a malformed request); fall back to a placeholder instead of baking
  // the literal string "undefined" into the request's origin.
  const host = req.headers.host || "localhost";

  let url;
  try {
    url = new URL(req.url, `http://${host}`);
  } catch (cause) {
    // `req.url` comes straight off the wire — a client can send a
    // request-target that survives Node's HTTP parser but isn't a valid
    // URL (e.g. an absolute-form target with malformed IPv6 brackets).
    // Without this, `new URL()` throws synchronously *outside* of
    // callers' try/catch (they call this before entering their request
    // try block), which crashes the whole process on a single bad
    // request. Tag the error so callers can turn it into a 400 instead.
    throw Object.assign(new Error(`Invalid request URL: ${req.url}`), {
      status: 400,
      cause,
    });
  }

  const requestInit = {
    method: req.method,
    headers: req.headers,
  };

  if (req.method !== "GET" && req.method !== "HEAD") {
    requestInit.body = req;
    requestInit.duplex = "half";
  }

  const request = new Request(url.toString(), requestInit);

  if (attachRaw) {
    Object.defineProperty(request, "raw", { value: req, enumerable: false });
  }

  return request;
};

export default toWebRequest;
