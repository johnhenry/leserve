/**
 * Test harness for (Request) => Response handlers.
 *
 * Usage:
 *   import { testHandler } from "leserve/test-harness";
 *
 *   const app = testHandler(myHandler);
 *   const res = await app.get("/users");
 *   assert.strictEqual(res.status, 200);
 *
 *   const res2 = await app.post("/users", { name: "Ada" });
 *   const body = await res2.json();
 */

/**
 * Wrap a handler for testing without starting a server.
 * @param {Function} handler - (Request, context?) => Response
 * @param {Object} [options]
 * @param {string} [options.base="http://localhost"] - Base URL for requests
 * @param {Object} [options.context] - Default context passed to handler
 * @returns {Object} Test client with HTTP method helpers
 */
export const testHandler = (handler, { base = "http://localhost", context } = {}) => {
  const request = async (path, options = {}) => {
    const url = new URL(path, base);
    const req = new Request(url, options);
    return handler(req, context);
  };

  request.get = (path, headers) =>
    request(path, { method: "GET", headers });

  request.head = (path, headers) =>
    request(path, { method: "HEAD", headers });

  request.post = (path, body, headers) =>
    request(path, buildOptions("POST", body, headers));

  request.put = (path, body, headers) =>
    request(path, buildOptions("PUT", body, headers));

  request.patch = (path, body, headers) =>
    request(path, buildOptions("PATCH", body, headers));

  request.delete = (path, headers) =>
    request(path, { method: "DELETE", headers });

  return request;
};

/** @private */
const buildOptions = (method, body, headers) => {
  const opts = { method, headers: { ...headers } };
  if (body == null) return opts;
  if (typeof body === "string") {
    opts.body = body;
    opts.headers["content-type"] ??= "text/plain";
  } else if (body instanceof FormData || body instanceof ArrayBuffer || body instanceof Uint8Array) {
    opts.body = body;
  } else {
    opts.body = JSON.stringify(body);
    opts.headers["content-type"] ??= "application/json";
  }
  return opts;
};
