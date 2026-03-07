/**
 * Authentication middleware factories for leserve handlers.
 *
 * Each factory takes a validation function and returns a higher-order
 * function that wraps a handler with authentication.
 *
 * Usage:
 *   import { bearerAuth } from "leserve/auth";
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
  const decoded = atob(auth.slice(6));
  const colon = decoded.indexOf(":");
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
