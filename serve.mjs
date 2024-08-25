import http from "http";
import https from "https";
import { Readable } from "stream";

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

    try {
      const response = await handler(request);
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
  };
};

export default serve;
