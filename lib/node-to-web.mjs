/**
 * Convert a Node.js `http`/`https` client-response `IncomingMessage` into a
 * standard Web API `Response`.
 *
 * Thin re-export of `@johnhenry/webwire`'s `toWebResponse()` -- kept at this
 * same path (`@johnhenry/leserve/node-to-web`) for backward compatibility.
 * See `@johnhenry/webwire`'s README for the full API and the Family story
 * behind why this moved.
 */
export { toWebResponse, default } from "@johnhenry/webwire/to-web-response";
