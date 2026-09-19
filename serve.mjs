import http from "http";
import https from "https";
import { Readable, pipeline } from "stream";
import { WebSocketServer } from "ws";
import { toWebRequest } from "./lib/node-request.mjs";

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

      if (response.body) {
        if (typeof response.body === "string") {
          res.end(response.body);
        } else if (response.body instanceof Uint8Array) {
          res.end(Buffer.from(response.body));
        } else if (response.body instanceof ReadableStream) {
          // `.pipe()` does not forward source errors to the destination —
          // if the stream errors mid-response (e.g. an upstream fetch
          // failing after the response already started), the unhandled
          // 'error' event on the Readable crashes the whole process.
          // `pipeline()` wires up error propagation and destroys both
          // sides for us.
          pipeline(Readable.fromWeb(response.body), res, (err) => {
            if (err) {
              console.error("Error streaming response body:", err);
              res.destroy(err);
            }
          });
        } else if (typeof response.body.pipe === "function") {
          pipeline(response.body, res, (err) => {
            if (err) {
              console.error("Error streaming response body:", err);
              res.destroy(err);
            }
          });
        } else {
          res.end(String(response.body));
        }
      } else {
        res.end();
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
      options.onListen({
        path: `http${cert && key ? "s" : ""}://${hostname}:${port}/`,
        port,
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
  const wss = new WebSocketServer({ noServer: true });

  return (innerHandler) => {
    // Attach the upgrade handler to the serve-level server
    const composed = (request, context = {}) => {
      const raw = request.raw || context.raw;
      if (
        raw &&
        request.headers.get("upgrade")?.toLowerCase() === "websocket"
      ) {
        // Perform the upgrade using the raw Node.js request
        const socket = raw.socket;
        wss.handleUpgrade(raw, socket, Buffer.alloc(0), (ws) => {
          wss.emit("connection", ws, raw);
          wsHandler(ws, request, context);
        });
        // Signal status 101 so `serve()` knows not to write a response body
        // (the socket has already been handed off for the upgrade). This is
        // intentionally a plain object, not `new Response(null, { status:
        // 101 })` — the Fetch spec's `Response` constructor rejects any
        // status outside 200-599, so constructing a real Response with
        // status 101 throws a RangeError. `serve()`'s dispatcher only reads
        // `.status` before returning early, so a plain object satisfies the
        // same contract without the illegal construction.
        return { status: 101 };
      }
      return innerHandler(request, context);
    };
    composed.fetch = composed;
    return composed;
  };
};

export default serve;
