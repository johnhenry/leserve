import http from "http";
import https from "https";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { toWebRequest } from "./lib/node-request.mjs";
import { upgradeRawSocket, WEBSOCKET_UPGRADE_RESPONSE } from "./lib/websocket.mjs";
import { getTrailers } from "./lib/trailers.mjs";

export const serve = (handlerOrOptions, maybeHandler) => {
  let options = {};
  let handler;

  // Accept both `serve(options, handler)` (Deno.serve-style) and
  // `serve(handler, options)` so the primary README example — which shows
  // the handler first — actually works.
  if (typeof handlerOrOptions === "function") {
    handler = handlerOrOptions;
    if (maybeHandler && typeof maybeHandler === "object") {
      options = maybeHandler;
    }
  } else {
    options = handlerOrOptions || {};
    handler = maybeHandler;
  }
  if (!handler) {
    handler = options.handler;
  }
  const { port = 8000, hostname = "localhost", cert, key } = options;
  const server =
    cert && key ? https.createServer({ cert, key }) : http.createServer();
  server.on("request", async (req, res) => {
    try {
      // Converting the raw request can itself throw (e.g. a malformed
      // request-target that Node's HTTP parser lets through but isn't a
      // valid URL) — this must happen *inside* the try block. Previously
      // it ran before this try/catch, so a single malformed request threw
      // an uncaught exception that crashed the whole process.
      const request = toWebRequest(req, { attachRaw: true });

      const context = {
        remoteAddress: req.socket?.remoteAddress,
        raw: req,
        state: new Map(),
      };

      const response = await handler(request, context);

      // Skip writing for WebSocket upgrades (status 101)
      if (response.status === 101) {
        return;
      }

      res.statusCode = response.status;

      // `Headers` iteration yields one [name, value] pair per occurrence
      // for headers that aren't combined (notably `Set-Cookie` — the Fetch
      // spec deliberately keeps repeated Set-Cookie entries distinct
      // instead of comma-joining them). Calling `res.setHeader(name, ...)`
      // once per pair would make each call overwrite the last, silently
      // dropping all but the final Set-Cookie header. Collect same-named
      // values first and hand Node an array so it emits one header line
      // per value.
      const headersByName = new Map();
      for (const [key, value] of response.headers) {
        if (headersByName.has(key)) {
          headersByName.get(key).push(value);
        } else {
          headersByName.set(key, [value]);
        }
      }
      for (const [key, values] of headersByName) {
        res.setHeader(key, values.length === 1 ? values[0] : values);
      }

      // Trailers are only meaningful once the body is fully written, and
      // `res.addTrailers()` must run before `res.end()`. `finishOk()` is
      // the *success*-path completion for every body shape below --
      // separate from error handling, which (as before this) destroys the
      // connection and deliberately does not attempt to write trailers or
      // call `res.end()` on an already-broken stream.
      const trailersPromise = getTrailers(response);
      const finishOk = async () => {
        if (trailersPromise) {
          const trailers = await trailersPromise;
          // res.addTrailers() reads own-enumerable object keys -- a
          // Headers instance has none (its entries live behind an
          // iterator, not plain properties), so it must be converted to a
          // plain object first or every trailer silently vanishes.
          res.addTrailers(Object.fromEntries(new Headers(trailers).entries()));
        }
        res.end();
      };

      if (response.body) {
        if (typeof response.body === "string") {
          res.write(response.body);
          await finishOk();
        } else if (response.body instanceof Uint8Array) {
          res.write(Buffer.from(response.body));
          await finishOk();
        } else if (response.body instanceof ReadableStream) {
          // `.pipe()` does not forward source errors to the destination —
          // if the stream errors mid-response (e.g. an upstream fetch
          // failing after the response already started), the unhandled
          // 'error' event on the Readable crashes the whole process.
          // `pipeline()` wires up error propagation and destroys both
          // sides for us. `{ end: false }` (only supported by the
          // Promise-returning `stream/promises` version -- the callback
          // version's last positional argument must be the callback
          // itself, not an options object) so `finishOk()` controls
          // `res.end()`, giving trailers a chance to attach first.
          try {
            await pipeline(Readable.fromWeb(response.body), res, { end: false });
            await finishOk();
          } catch (err) {
            console.error("Error streaming response body:", err);
            res.destroy(err);
          }
        } else if (typeof response.body.pipe === "function") {
          try {
            await pipeline(response.body, res, { end: false });
            await finishOk();
          } catch (err) {
            console.error("Error streaming response body:", err);
            res.destroy(err);
          }
        } else {
          res.write(String(response.body));
          await finishOk();
        }
      } else {
        await finishOk();
      }
    } catch (error) {
      console.error("Error handling request:", error);
      // Prefer a tagged status from the error (e.g. the 400 thrown by
      // `toWebRequest()` for a malformed URL, or a 413 thrown by
      // `body.mjs`'s `json()`/`text()` for an oversized payload) so those
      // don't get flattened into a generic 500.
      const status =
        Number.isInteger(error?.status) && error.status >= 400 && error.status <= 599
          ? error.status
          : 500;
      if (!res.headersSent) {
        res.statusCode = status;
        res.end(status === 500 ? "Internal Server Error" : error.message || "Error");
      } else {
        res.destroy(error);
      }
    }
  });

  const _finished = new Promise((resolve) => {
    server.on("close", resolve);
  });

  if (options.signal) {
    options.signal.addEventListener("abort", () => {
      server.close();
    });
  }

  server.listen(port, hostname, () => {
    if (typeof options.onListen === "function") {
      // `port: 0` (an ephemeral port, requested by callers that want the
      // OS to assign one) was being echoed straight back as `0` here --
      // read the port the OS actually bound instead, same as any other
      // real address.
      const actualPort = server.address()?.port ?? port;
      options.onListen({
        path: `http${cert && key ? "s" : ""}://${hostname}:${actualPort}/`,
        port: actualPort,
      });
    }
  });

  return {
    get finished() {
      return _finished;
    },
    async [Symbol.asyncDispose]() {
      server.close();
      await _finished;
    },
  };
};

/**
 * WebSocket middleware composable.
 * Returns a middleware `(innerHandler) => composedHandler` that upgrades
 * WebSocket requests and delegates everything else to the inner handler.
 *
 * @param {(ws: import('ws').WebSocket, request: Request, context?: object) => void} wsHandler
 * @returns {(innerHandler: Function) => Function}
 *
 * @example
 * const handler = onWebSocket((ws, req) => {
 *   ws.on('message', (msg) => ws.send(`echo: ${msg}`));
 * })(router);
 * serve(handler, { port: 3000 });
 */
export const onWebSocket = (wsHandler) => {
  return (innerHandler) => {
    const composed = async (request, context = {}) => {
      const raw = request.raw || context.raw;
      if (
        raw &&
        request.headers.get("upgrade")?.toLowerCase() === "websocket"
      ) {
        // upgradeRawSocket/WEBSOCKET_UPGRADE_RESPONSE live in
        // lib/websocket.mjs (also exported as `@johnhenry/leserve/websocket`) so a
        // caller that wants to make this decision *inline* inside a single
        // request handler -- rather than via this outer middleware
        // wrapping the whole server -- can use the same primitive
        // (@johnhenry/servable's `upgradeWebSocket()` does exactly this).
        const ws = await upgradeRawSocket(raw);
        wsHandler(ws, request, context);
        return WEBSOCKET_UPGRADE_RESPONSE;
      }
      return innerHandler(request, context);
    };
    composed.fetch = composed;
    return composed;
  };
};

export default serve;
