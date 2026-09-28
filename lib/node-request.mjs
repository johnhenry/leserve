/**
 * Convert a Node.js `http`/`https` `IncomingMessage` into a standard Web
 * API `Request`.
 *
 * Thin re-export of `@johnhenry/webwire`'s `toWebRequest()` -- this used to
 * be leserve's own implementation, extracted into webwire once a real,
 * independently-duplicated (and slightly diverged) copy turned up in
 * `@johnhenry/dialback`. Kept here, at this same path, so existing
 * dependents (`@johnhenry/servant` depends on `@johnhenry/leserve` *just*
 * for this) don't need to change anything.
 *
 * Also published as `@johnhenry/leserve/node-request` for other packages
 * that need their own Node HTTP bridge to speak the same `Request` shape
 * @johnhenry/leserve itself produces (e.g. `@johnhenry/servable`'s Node
 * adapter).
 */
export { toWebRequest, default } from "@johnhenry/webwire/to-web-request";
