/**
 * Low-level WebSocket upgrade primitive. `onWebSocket()` in `serve.mjs` is
 * sugar over this -- exported directly (via `@johnhenry/leserve/websocket`) for
 * callers that want to make the upgrade decision *inline*, within a single
 * request handler, rather than via an outer middleware that wraps the
 * whole server (e.g. `@johnhenry/servable`'s `upgradeWebSocket()`, which
 * is called from inside a matched `<Route>`'s own handler).
 */
import { WebSocketServer } from "ws";

// `{ noServer: true }` mode doesn't bind its own socket/port -- it's a pure
// handshake-completion helper you call `handleUpgrade` on as many times as
// needed. One shared instance is the intended usage (that's the whole
// point of `noServer` mode); the original `onWebSocket()` already created
// exactly one per `onWebSocket()` call and reused it for every upgrade --
// this keeps that, at module scope, so `upgradeRawSocket` itself stays a
// plain function callers don't need to instantiate anything to use.
const wss = new WebSocketServer({ noServer: true });

/**
 * Completes the WebSocket handshake on a raw Node `IncomingMessage` (the
 * same object `toWebRequest(req, { attachRaw: true })` attaches as
 * `request.raw`) and resolves with the connected `ws` `WebSocket` instance.
 *
 * @param {import('http').IncomingMessage} raw
 * @returns {Promise<import('ws').WebSocket>}
 */
export const upgradeRawSocket = (raw) => {
  return new Promise((resolvePromise) => {
    wss.handleUpgrade(raw, raw.socket, Buffer.alloc(0), (ws) => {
      wss.emit("connection", ws, raw);
      resolvePromise(ws);
    });
  });
};

/**
 * A real `Response` can't hold status 101 -- the Fetch spec's constructor
 * rejects any status outside 200-599. Callers that already completed a
 * WebSocket upgrade (the socket has been handed off) should return this
 * marker instead; `serve()` (and any other Fetch-shaped dispatcher, e.g.
 * servable's) recognizes `status === 101` and skips normal response
 * writing rather than requiring the object to be a real `Response`.
 */
export const WEBSOCKET_UPGRADE_RESPONSE = Object.freeze({ status: 101 });
