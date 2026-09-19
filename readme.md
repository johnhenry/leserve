# LeServe

[![npm version](https://badge.fury.io/js/leserve.svg)](https://badge.fury.io/js/leserve)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

<img alt="" width="512" height="512" src="./logo.jpeg" style="width:512px;height:512px"/>

A simple HTTP server with support for modern JavaScript features.

LeServe works greate with [LeRoute](https://www.npmjs.com/package/leroute), a library for routing requests.

## Installation

```bash
npm install leserve
```

## Which API should I use?

`leserve` ships one API: `serve()`, described below. If you want a
self-contained, batteries-included server instead — with built-in routing,
middleware, and WebSocket handling dispatched through a service-worker-style
`addEventListener("fetch", ...)` API — see
[`@johnhenry/servant`](https://github.com/johnhenry/servant), a separate
package extracted from what used to be `leserve/controls` + `leserve/event`.
`servant` depends on `leserve` only for `leserve/node-request`; the two are
otherwise independent server implementations and don't interoperate — don't
`start()` a `servant` server and call this package's `serve()` in the same
process expecting them to share middleware/state.

## Usage: serve

(See similar: [Deno.serve](https://docs.deno.com/api/deno/~/Deno.serve))

```javascript
import serve from "leserve/serve";

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

Either argument order works:

- `serve(handler, options?)` — handler first (shown above).
- `serve(options, handler)` — options first, [`Deno.serve`](https://docs.deno.com/api/deno/~/Deno.serve)-style (used internally by the `leserve` CLI).

##### Options

- `port`: Port number (default: 8000)
- `hostname`: Hostname (default: 'localhost')
- `cert`: SSL certificate for HTTPS (optional)
- `key`: SSL key for HTTPS (optional)
- `signal`: An `AbortSignal`; aborting it calls `server.close()`
- `onListen({ path, port })`: Called once the server is listening

##### Handler Function

The handler function receives a `Request` object (and an optional `context` object — `{ remoteAddress, raw, state }`, where `state` is a fresh `Map` per request) and should return a `Response` object or a Promise that resolves to a `Response` object.

##### Lifecycle hooks

`onListen` (above) is currently the only lifecycle hook `serve()` exposes — there is no `onRequest`/`onResponse` hook. To intercept every request/response, wrap your handler with [`compose()`](#composefns) or write middleware directly in the `(innerHandler) => (request, ctx) => Response` shape used by `leserve/auth` and `onWebSocket()`.

#### `onWebSocket(wsHandler)`

A composable WebSocket-upgrade middleware for the `serve()` model — this is `serve.mjs`'s equivalent of `controls`'s built-in WebSocket support, kept explicit and opt-in rather than automatic.

`onWebSocket` returns a middleware factory `(innerHandler) => composedHandler`: requests with an `Upgrade: websocket` header are upgraded and handed to `wsHandler`; every other request falls through to `innerHandler` unchanged.

```javascript
import serve, { onWebSocket } from "leserve/serve";

const withWebSocket = onWebSocket((ws, request, context) => {
  ws.on("message", (message) => {
    ws.send(`echo: ${message}`);
  });
});

const handler = withWebSocket((request) => new Response("Hello, World!"));

serve(handler, { port: 3000 });
```

- `wsHandler(ws, request, context)` is called once per established connection with the [`ws`](https://www.npmjs.com/package/ws) `WebSocket` instance, the original upgrade `Request`, and the handler `context`.
- Because it follows the same `(innerHandler) => handler` shape as other `serve()` middleware, it composes with `compose()`, `leserve/auth`, and your own router just like anything else.

## API Reference

### Global Types

`Request`, `Response`, `Headers`, `URL`, `URLSearchParams`, and (in modern Node.js) `WebSocket` are standard Node.js runtime globals (Node 18+) — they're available out of the box, and leserve doesn't add or polyfill them.

## Usage: CLI

A flexible CLI tool for serving JavaScript modules with various options.

### Installation

```bash
npm install -g leserve
```

### Usage

```bash
leserve <path-to-file> [options]
```

Or

```bash
npx leserve <path-to-file> [options]
```

#### Options

- `-p, --port <port>`: Specify the port number (default: 8000)
- `-e, --export <name>`: Specify the export name to use (default: 'default')
- `--echo`: Enable echo mode

### Default Behavior

By default, `leserve` serves the default export from the specified file at `localhost:8000` using `./serve.mjs`.

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
leserve myHandler.mjs
```

This serves the default export from `myHandler.mjs` at `localhost:8000`.

#### Port Flag

You can specify a custom port using the `-p` or `--port` flag:

```bash
leserve myHandler.mjs -p 8001
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
leserve myHandlers.mjs -p 8080 -e handler
```

This serves the export named 'handler' from `myHandlers.mjs` at `localhost:8080`.

### Echo Mode

Using the `--echo` flag causes the server to respond as an echo server.

```bash
leserve --echo
```

echos back requests as responses in JSON format on port 8000.

## Body Parsing & Response Helpers

```js
import { json, text, form, buffer, respond, error, redirect } from "leserve/body";
```

### Request Parsing

```js
const handler = async (request) => {
  const data = await json(request);              // parse JSON body
  const body = await text(request, { limit: 1024 }); // with size limit
  const formData = await form(request);          // parse FormData
  const raw = await buffer(request);             // parse ArrayBuffer
};
```

The `limit` option (bytes) throws with `{ status: 413 }` when exceeded.

### Response Helpers

```js
respond({ ok: true })               // → 200 JSON response
respond({ id: 1 }, { status: 201 }) // → 201 JSON response
error("Not found", 404)             // → 404 JSON error
redirect("/login")                  // → 302 redirect
```

## Authentication Middleware

```js
import { basicAuth, bearerAuth, apiKeyAuth } from "leserve/auth";
```

Each factory takes a validation function and returns a handler wrapper:

```js
const requireAuth = bearerAuth(async (token) => token === process.env.SECRET);
const handler = requireAuth((request) => respond({ ok: true }));
```

### `basicAuth(validate)`

```js
basicAuth(async (username, password, request) => {
  return username === "admin" && password === "secret";
});
```

### `bearerAuth(validate)`

```js
bearerAuth(async (token, request) => {
  return token === process.env.API_TOKEN;
});
```

### `apiKeyAuth(validate, options?)`

```js
apiKeyAuth(async (key, request) => {
  return key === process.env.API_KEY;
}, { header: "x-api-key" }); // default header
```

## Middleware Composition

```js
import { compose } from "leserve/compose";
```

Chain middleware and a base handler — all in the `(Request) => Response` shape used by `serve()` — into a single handler:

```js
const app = compose(withCache(), requireAuth, handler);
serve(app, { port: 3000 });
```

### `compose(...fns)`

- Each middleware has the signature `(next) => (request, ctx) => Response`.
- The last argument is the base handler: `(request, ctx) => Response`.
- Middleware run in the order passed, each wrapping the next, with the base handler innermost — the same composition order used by `onWebSocket()` and `leserve/auth`.

Like `leserve/auth` and `onWebSocket()`, `compose()` is designed for the `serve()` model — see [Which API should I use?](#which-api-should-i-use).

## Test Harness

```js
import { testHandler } from "leserve/test-harness";
```

Test `(Request) => Response` handlers without starting a server:

```js
import { describe, it } from "node:test";
import assert from "node:assert";

const app = testHandler(myHandler);

const res = await app.get("/users");
assert.strictEqual(res.status, 200);

const res2 = await app.post("/users", { name: "Ada" });
const body = await res2.json();
assert.strictEqual(body.name, "Ada");
```

Methods: `app.get()`, `app.head()`, `app.post()`, `app.put()`, `app.patch()`, `app.delete()`.

Objects and strings are auto-serialized with the appropriate `content-type`.

## Exports

| Export | Description |
|--------|-------------|
| `leserve` or `leserve/serve` | `serve(handler, options?)`, `onWebSocket(wsHandler)` — Handler-based server (recommended default) |
| `leserve/genport` | Random port generation |
| `leserve/body` | `json`, `text`, `form`, `buffer`, `respond`, `error`, `redirect` |
| `leserve/auth` | `basicAuth`, `bearerAuth`, `apiKeyAuth` — for the `serve()` model |
| `leserve/compose` | `compose(...fns)` — middleware composition for the `serve()` model |
| `leserve/test-harness` | `testHandler` — Test `serve()`-style handlers without a server |
| `leserve/websocket` | `upgradeRawSocket(raw)`, `WEBSOCKET_UPGRADE_RESPONSE` — the low-level primitive `onWebSocket()` is sugar over, for a caller that wants to decide inline within a single request handler whether to upgrade |
| `leserve/node-request` | `toWebRequest(req, options?)` — converts a raw Node `IncomingMessage` into a Web `Request`, the same conversion `serve()` itself uses |
| `leserve/trailers` | `setTrailers(response, trailers)`, `getTrailers(response)` — HTTP trailers, which aren't part of the Fetch `Response` model; `serve()` sends them via `res.addTrailers()` after the body finishes |

## License

This project is licensed under the MIT License.
