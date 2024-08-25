# Serve Cold ❄️

"HTTP is a dish best best serve co... wait a minute... does that make sense?"

[![npm version](https://badge.fury.io/js/serve-cold.svg)](https://badge.fury.io/js/serve-cold)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

<img alt="" width="512" height="512" src="./sc.jpeg" style="width:512px;height:512px"/>

A simple HTTP server with support for modern JavaScript features.

## Installation

```bash
npm install serve-cold
```

## Usage: serve

(See similar: [Deno.serve](https://docs.deno.com/api/deno/~/Deno.serve))

```javascript
import serve from "serve-cold/serve";

const handler = (request) => {
  return new Response("Hello, World!", {
    status: 200,
    headers: { "Content-Type": "text/plain" },
  });
};

const server = serve(handler, { port: 3000 });
```

### API

#### `serve(handlerOrOptions, maybeHandler)`

- `handlerOrOptions`: Either a handler function or an options object.
- `maybeHandler`: If the first argument is an options object, this should be the handler function.

##### Options

- `port`: Port number (default: 8000)
- `hostname`: Hostname (default: 'localhost')
- `cert`: SSL certificate for HTTPS (optional)
- `key`: SSL key for HTTPS (optional)

##### Handler Function

The handler function receives a `Request` object and should return a `Response` object or a Promise that resolves to a `Response` object.

## Usage: events + controls

(See similar: [WinterJS](https://github.com/wasmerio/winterjs))

```javascript
import "serve-cold/events";
import { start } from "serve-cold/controls";
start({ port: 3000 });
addEventListener("fetch", (event) => {
  event.respondWith(new Response("Hello, World!", { status: 200 }));
});
```

## Features

### Event Listeners

- `addEventListener(event, handler)`: Add an event listener
- `removeEventListener(event, handler)`: Remove an event listener

Available events:

| Event     | Description                                            |
| --------- | ------------------------------------------------------ |
| fetch     | Emitted for handling HTTP requests                     |
| start     | Emitted when the server starts                         |
| stop      | Emitted when the server stops                          |
| error     | Emitted when a server error occurs                     |
| request   | Emitted for every incoming request                     |
| websocket | Emitted when a new WebSocket connection is established |

### Server Control

- `start(options)`: Start the server
- `stop()`: Stop the server
- `emit(event, ...args)`: Emit a custom event

### Middleware

```javascript
use(async (req, res) => {
  console.log(`[Middleware] ${req.method} ${req.url}`);
  return req;
});
```

### Routing

```javascript
route("GET", "/hello/:name", async (req, params) => {
  return new Response(`Hello, ${params.name}!`, { status: 200 });
});
```

### WebSockets

```javascript
addEventListener("websocket", (ws) => {
  ws.on("message", (message) => {
    console.log("Received:", message);
    ws.send(`Echo: ${message}`);
  });
});
```

### Server-Sent Events

```javascript
addEventListener("fetch", async (event) => {
  if (event.request.url.endsWith("/sse")) {
    const headers = new Headers({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    const response = new Response(null, { headers });

    const stream = new ReadableStream({
      start(controller) {
        setInterval(() => {
          const event = createServerSentEvent(
            { time: new Date().toISOString() },
            "update"
          );
          controller.enqueue(event);
        }, 1000);
      },
    });

    response.body = stream;
    event.respondWith(response);
  }
});
```

## API Reference

### Server Options

```typescript
type ServerOptions = {
  port: number;
  https?: {
    key: string;
    cert: string;
  };
};
```

### Middleware Function

```typescript
type MiddlewareFunction = (
  req: Request,
  res: Response
) => Promise<Request | Response | void>;
```

### Route Handler

```typescript
type RouteHandler = (
  req: Request,
  params: Record<string, string>
) => Promise<Response>;
```

### Global Functions

- `addEventListener(event: string, handler: Function): void`
- `removeEventListener(event: string, handler: Function): void`

### Controls

- `start(options: ServerOptions): Promise<void>`
- `stop(): Promise<void>`
- `emit(event: string, ...args: any[]): boolean`
- `use(middleware: MiddlewareFunction): void`
- `route(method: string, path: string, handler: RouteHandler): void`
- `createServerSentEvent(data: any, event?: string, id?: string): string`

### Global Types

The following Web API types are made available globally:

- `Request`
- `Response`
- `Headers`
- `URL`
- `URLSearchParams`
- `WebSocket`

## Examples

### Starting an HTTPS Server

```javascript
import fs from "fs";

const httpsOptions = {
  key: fs.readFileSync("path/to/key.pem"),
  cert: fs.readFileSync("path/to/cert.pem"),
};

start({ port: 3000, https: httpsOptions });
```

### Using Middleware and Routing

```javascript
use(async (req, res) => {
  console.log(`[Middleware] ${req.method} ${req.url}`);
  return req;
});

route("GET", "/hello/:name", async (req, params) => {
  return new Response(`Hello, ${params.name}!`, { status: 200 });
});

route("POST", "/echo", async (req) => {
  const body = await req.json();
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
```

### WebSocket Echo Server

```javascript
addEventListener("websocket", (ws) => {
  console.log("New WebSocket connection");
  ws.on("message", (message) => {
    console.log("Received:", message);
    ws.send(`Echo: ${message}`);
  });
});
```

### Server-Sent Events

```javascript
addEventListener("fetch", async (event) => {
  if (event.request.url.endsWith("/sse")) {
    const headers = new Headers({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    const response = new Response(null, { headers });
    let counter = 0;

    const stream = new ReadableStream({
      start(controller) {
        const interval = setInterval(() => {
          const event = createServerSentEvent({ counter: counter++ }, "update");
          controller.enqueue(event);
        }, 1000);

        setTimeout(() => {
          clearInterval(interval);
          controller.close();
        }, 10000);
      },
    });

    response.body = stream;
    event.respondWith(response);
  }
});
```

## Usage: CLI

A flexible CLI tool for serving JavaScript modules with various options.

### Installation

```bash
npm install -g serve-cold
```

### Usage

```bash
serve-cold <path-to-file> [options]
```

Or

```bash
npx serve-cold <path-to-file> [options]
```

#### Options

- `-p, --port <port>`: Specify the port number (default: 8000)
- `-e, --export <name>`: Specify the export name to use (default: 'default')
- `-E, --events`: Enable events mode
- `--echo`: Enable echo mode

### Default Behavior

By default, `serve-cold` serves the default export from the specified file at `localhost:8000` using `./serve.mjs`.

Example:

```javascript
// myHandler.mjs
export default (request) => {
  return new Response("Default Handler", {
    headers: {
      "content-type": "text/plain",
    },
  });
};
```

```bash
serve-cold myHandler.mjs
```

This serves the default export from `myHandler.mjs` at `localhost:8000`.

#### Port Flag

You can specify a custom port using the `-p` or `--port` flag:

```bash
serve-cold myHandler.mjs -p 8001
```

This serves the default export from `myHandler.mjs` at `localhost:8001`.

#### Export Flag

You can choose an alternative export with the `-e` or `--export` flag:

```javascript
// myHandlers.mjs
export const handler = (request) => {
  return new Response("Named Handler", {
    headers: {
      "content-type": "text/plain",
    },
  });
};
```

```bash
serve-cold myHandlers.mjs -p 8080 -e handler
```

This serves the export named 'handler' from `myHandlers.mjs` at `localhost:8080`.

### Events Mode

Using the `-E` or `--events` flag causes the server to respond to events using `./controls.mjs` and `./event.mjs`.

Example:

```javascript
// myEventHandler.mjs
addEventListener("fetch", async (event) => {
  event.respondWith(new Response("Event!"));
});
```

```bash
serve-cold myEventHandler.mjs -E
```

This listens for events at `localhost:8000`.

You can still use the port flag in events mode:

```bash
serve-cold myEventHandler.mjs -E -p 8080
```

This listens for events at `localhost:8080`.

### Echo Mode

Using the `-E` or `--events` flag causes the server to respond as an echo server.

```bash
serve-cold --echo
```

echos back requests as responses in JSON format on port 8000.

## Notes

- This server implementation extends the global object, allowing you to call these methods directly (e.g., `addEventListener` instead of `globalThis.addEventListener`).
- WebSocket support is provided through the `ws` package.

## License

This project is licensed under the MIT License.
