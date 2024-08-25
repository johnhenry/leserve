import http from "node:http";
import https from "node:https";
import { WebSocketServer } from "ws";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";

const eventEmitter = new EventEmitter();

const middlewares = [];
const routes = [];

const addEventListener = (event, handler) => {
  eventEmitter.on(event, handler);
};

const removeEventListener = (event, handler) => {
  eventEmitter.off(event, handler);
};

const servers = [];

const start = async (options) => {
  const handler = async (req, res) => {
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

    // const request = new Request(req);
    let response;

    try {
      for (const middleware of middlewares) {
        const result = await middleware(request, response);
        if (result instanceof Response) {
          response = result;
          break;
        }
      }

      if (!response) {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const route = routes.find((r) => {
          if (r.method !== req.method) return false;
          const pathParts = r.path.split("/");
          const urlParts = url.pathname.split("/");
          if (pathParts.length !== urlParts.length) return false;
          const params = {};
          for (let i = 0; i < pathParts.length; i++) {
            if (pathParts[i].startsWith(":")) {
              params[pathParts[i].slice(1)] = urlParts[i];
            } else if (pathParts[i] !== urlParts[i]) {
              return false;
            }
          }
          request.params = params;
          return true;
        });

        if (route) {
          response = await route.handler(request, request.params);
        } else {
          const fetchEvent = {
            request,
            respondWith: (r) => {
              response = r;
            },
          };
          eventEmitter.emit("fetch", fetchEvent);
          if (!response) {
            response = new Response("Not Found", { status: 404 });
          }
        }
      }

      if (!response) {
        response = new Response("Not Found", { status: 404 });
      }
    } catch (error) {
      eventEmitter.emit("error", error);
      response = new Response("Internal Server Error", { status: 500 });
    }

    res.writeHead(response.status, Object.fromEntries(response.headers));
    if (response.body instanceof ReadableStream) {
      Readable.fromWeb(response.body).pipe(res);
    } else {
      res.end(response.body);
    }
  };

  const server = options.https
    ? https.createServer(options.https, handler)
    : http.createServer(handler);

  const wss = new WebSocketServer({ server });

  wss.on("connection", (ws, req) => {
    eventEmitter.emit("websocket", ws);
  });

  return new Promise((resolve) => {
    server.listen(options.port, () => {
      const index = servers.length;
      servers.push(server);
      eventEmitter.emit("start", { index, port: options.port });
      resolve(index);
    });
  });
};

const stop = (index) => {
  const server = servers[index];
  return new Promise((resolve) => {
    if (server?.listening) {
      server.close(() => {
        eventEmitter.emit("stop", { index });
        delete servers[index];
        resolve();
      });
    } else {
      resolve();
    }
  });
};

const emit = (event, ...args) => {
  return eventEmitter.emit(event, ...args);
};

const use = (middleware) => {
  middlewares.push(middleware);
};

const route = (method, path, handler) => {
  routes.push({ method, path, handler });
};

const createServerSentEvent = (data, event, id) => {
  let sseData = "";
  if (event) {
    sseData += `event: ${event}\n`;
  }
  if (id) {
    sseData += `id: ${id}\n`;
  }
  sseData += `data: ${JSON.stringify(data)}\n\n`;
  return sseData;
};

export {
  servers,
  addEventListener,
  removeEventListener,
  start,
  stop,
  emit,
  use,
  route,
  createServerSentEvent,
};
