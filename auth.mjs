/**
 * Authentication middleware factories for @johnhenry/leserve handlers.
 *
 * Each factory takes a validation function and returns a higher-order
 * function that wraps a handler with authentication.
 *
 * Usage:
 *   import { bearerAuth } from "@johnhenry/leserve/auth";
 *
 *   const requireAuth = bearerAuth(async (token) => token === SECRET);
 *   const handler = requireAuth((request) => new Response("ok"));
 */

/** @private */
const unauthorized = (message = "Unauthorized", scheme = "Bearer") => {
  return new Response(JSON.stringify({ error: message }), {
    status: 401,
    headers: {
      "content-type": "application/json",
      "www-authenticate": scheme,
    },
  });
};

/**
 * HTTP Basic authentication middleware.
 * @param {Function} validate - async (username, password, request) => boolean
 * @returns {Function} (handler) => handler
 */
export const basicAuth = (validate) => (handler) => async (request, ctx) => {
  const auth = request.headers.get("authorization");
  if (!auth || !auth.startsWith("Basic ")) {
    return unauthorized("Missing credentials", "Basic");
  }
  // The base64 payload and the "user:pass" shape inside it are both
  // attacker-controlled. A non-base64 value made `atob()` throw
  // synchronously — since this function is async, that became a rejected
  // promise that propagated past this middleware as an uncaught error
  // (a generic 500 upstream) instead of the 401 a malformed credential
  // should produce. A payload with no colon separator isn't valid
  // "user:pass" credentials either (RFC 7617), so treat both cases the
  // same way rather than passing mangled values to `validate()`.
  let decoded;
  try {
    decoded = atob(auth.slice(6));
  } catch {
    return unauthorized("Malformed credentials", "Basic");
  }
  const colon = decoded.indexOf(":");
  if (colon === -1) {
    return unauthorized("Malformed credentials", "Basic");
  }
  const username = decoded.slice(0, colon);
  const password = decoded.slice(colon + 1);
  if (!(await validate(username, password, request))) {
    return unauthorized("Invalid credentials", "Basic");
  }
  return handler(request, ctx);
};

/**
 * Bearer token authentication middleware.
 * @param {Function} validate - async (token, request) => boolean
 * @returns {Function} (handler) => handler
 */
export const bearerAuth = (validate) => (handler) => async (request, ctx) => {
  const auth = request.headers.get("authorization");
  if (!auth || !auth.startsWith("Bearer ")) {
    return unauthorized("Missing token", "Bearer");
  }
  const token = auth.slice(7);
  if (!(await validate(token, request))) {
    return unauthorized("Invalid token", "Bearer");
  }
  return handler(request, ctx);
};

/**
 * API key authentication middleware.
 * @param {Function} validate - async (key, request) => boolean
 * @param {Object} [options]
 * @param {string} [options.header="x-api-key"] - Header to read the key from
 * @returns {Function} (handler) => handler
 */
export const apiKeyAuth = (validate, { header = "x-api-key" } = {}) =>
  (handler) => async (request, ctx) => {
    const key = request.headers.get(header);
    if (!key) {
      return unauthorized(`Missing ${header}`);
    }
    if (!(await validate(key, request))) {
      return unauthorized("Invalid API key");
    }
    return handler(request, ctx);
  };
