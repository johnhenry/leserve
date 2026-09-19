/**
 * Shared internal helper: convert a Node.js `http`/`https` `IncomingMessage`
 * into a standard Web API `Request`.
 *
 * Used by both `serve.mjs` (the `serve()` handler-based server) and
 * `controls.mjs` (the event-based `start()`/`use()`/`route()` server) so the
 * conversion logic — URL construction, header copying, and the
 * `duplex: "half"` body-streaming requirement — lives in exactly one place.
 *
 * This is an internal module: it is not part of the package's public
 * `exports` map and should only be imported via relative paths from within
 * this package.
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
  const url = new URL(req.url, `http://${req.headers.host}`);

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
