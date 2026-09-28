/**
 * HTTP trailers aren't part of the Fetch `Response` model at all -- there's
 * no `response.trailers` to set. `setTrailers()` is how a handler attaches
 * trailers to a `Response` it's returning; `serve()` (via
 * `@johnhenry/webwire`'s `writeWebResponse()`) checks for them after the
 * body finishes streaming and transmits them via Node's own
 * `res.addTrailers()`.
 *
 * Thin re-export of `@johnhenry/webwire`'s trailers module -- kept at this
 * same path (`@johnhenry/leserve/trailers`) for backward compatibility.
 * `serve.mjs` itself now calls webwire's `writeWebResponse()` directly
 * (which uses webwire's own copy of this module internally), so this
 * re-export must resolve to the exact same module instance for a handler's
 * `setTrailers()` call to actually be seen -- `export { ... } from` does
 * that automatically (Node's module cache, not a copy).
 */
export { setTrailers, getTrailers } from "@johnhenry/webwire/trailers";
