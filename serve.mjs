import http from "http";
import https from "https";
import { Readable } from "stream";
import { WebSocketServer } from "ws";

export const serve = (handlerOrOptions, maybeHandler) => {
  let options = {};
  let handler;

  if (typeof handlerOrOptions === "function") {
    handler = handlerOrOptions;
  } else {
    options = handlerOrOptions;
    handler = maybeHandler;
  }
  if (!handler) {
    handler = options.handler;
  }
  const { port = 8000, hostname = "localhost", cert, key } = options;
  const server =
    cert && key ? https.createServer({ cert, key }) : http.createServer();
  server.on("request", async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);

    const requestInit = {
      method: req.method,
      headers: req.headers,
    };

    if (req.method !== "GET" && req.method !== "HEAD") {
      requestInit.body = req;
      requestInit.duplex = "half"; // Add this line
    }

    const request = new Request(url.toString(), requestInit);
    Object.defineProperty(request, "raw", { value: req, enumerable: false });

    const context = {
      remoteAddress: req.socket?.remoteAddress,
      raw: req,
      state: new Map(),
    };

    try {
      const response = await handler(request, context);

      // Skip writing for WebSocket upgrades (status 101)
      if (response.status === 101) {
        return;
      }

      res.statusCode = response.status;

      for (const [key, value] of response.headers) {
        res.setHeader(key, value);
      }

      if (response.body) {
        if (typeof response.body === "string") {
          res.end(response.body);
        } else if (response.body instanceof Uint8Array) {
          res.end(Buffer.from(response.body));
        } else if (response.body instanceof ReadableStream) {
          Readable.fromWeb(response.body).pipe(res);
        } else if (typeof response.body.pipe === "function") {
          response.body.pipe(res);
        } else {
          res.end(String(response.body));
        }
      } else {
        res.end();
      }
    } catch (error) {
      console.error("Error handling request:", error);
      res.statusCode = 500;
      res.end("Internal Server Error");
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
        // Return 101 so that serve knows not to write a response
        return new Response(null, { status: 101 });
      }
      return innerHandler(request, context);
    };
    composed.fetch = composed;
    return composed;
  };
};

export default serve;
