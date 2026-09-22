# LeServe

[![npm version](https://badge.fury.io/js/%40johnhenry%2Fleserve.svg)](https://www.npmjs.com/package/@johnhenry/leserve)
[![CI](https://github.com/johnhenry/leserve/actions/workflows/ci.yml/badge.svg)](https://github.com/johnhenry/leserve/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Full documentation: [opensource.johnhenry.me/leserve](https://opensource.johnhenry.me/leserve/)

<img alt="" width="512" height="512" src="./logo.jpeg" style="width:512px;height:512px"/>

A simple HTTP server with support for modern JavaScript features.

LeServe works great with [`@johnhenry/servable`](https://github.com/johnhenry/servable) (and its sibling [`@johnhenry/hostable`](https://github.com/johnhenry/hostable)), which build routing on top of leserve — servable's Node adapter delegates to leserve internally. See [`## Family`](#family) below for the full relationship, including `@johnhenry/servant`.

## Contents

- [Installation](#installation)
- [Usage: serve](#usage-serve)
  - [API](#api)
- [API Reference](#api-reference)
  - [Global Types](#global-types)
- [Usage: CLI](#usage-cli)
  - [Installation](#installation-1)
  - [Usage](#usage)
  - [Default Behavior](#default-behavior)
  - [Echo Mode](#echo-mode)
- [Body Parsing & Response Helpers](#body-parsing--response-helpers)
  - [Request Parsing](#request-parsing)
  - [Response Helpers](#response-helpers)
- [Authentication Middleware](#authentication-middleware)
  - [`basicAuth(validate)`](#basicauthvalidate)
  - [`bearerAuth(validate)`](#bearerauthvalidate)
  - [`apiKeyAuth(validate, options?)`](#apikeyauthvalidate-options)
- [Middleware Composition](#middleware-composition)
  - [`compose(...fns)`](#composefns)
- [Test Harness](#test-harness)
- [Exports](#exports)
- [Security model](#security-model)
- [Family](#family)
- [License](#license)

## Installation

```bash
npm install @johnhenry/leserve
```

> **Provenance:** previously published as unscoped `leserve@0.0.0`. Adopted
> into the `@johnhenry` scope; version restarts at `0.0.0` there too (it
> was already at 0.0.0 unscoped, so this isn't a downgrade -- just a new
> home).

`@johnhenry/leserve` ships one API: `serve()`, below — a plain `(Request) => Response`
handler, no routing/middleware/event framework attached. If you want a
batteries-included server instead, see
[`@johnhenry/servant`](https://github.com/johnhenry/servant) (an
independent implementation; the two don't interoperate).

## Usage: serve

(See similar: [Deno.serve](https://docs.deno.com/api/deno/~/Deno.serve))

```javascript
import serve from "@johnhenry/leserve/serve";

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

`onListen` (above) is currently the only lifecycle hook `serve()` exposes — there is no `onRequest`/`onResponse` hook. To intercept every request/response, wrap your handler with [`compose()`](#composefns) or write middleware directly in the `(innerHandler) => (request, ctx) => Response` shape used by `@johnhenry/leserve/auth` and `onWebSocket()`.

#### `onWebSocket(wsHandler)`

A composable WebSocket-upgrade middleware for the `serve()` model — kept explicit and opt-in rather than automatic. (SSE, routing, and middleware built on top of `serve()` now live in [`@johnhenry/servant`](https://github.com/johnhenry/servant), not in this package.)

`onWebSocket` returns a middleware factory `(innerHandler) => composedHandler`: requests with an `Upgrade: websocket` header are upgraded and handed to `wsHandler`; every other request falls through to `innerHandler` unchanged.

```javascript
import serve, { onWebSocket } from "@johnhenry/leserve/serve";

const withWebSocket = onWebSocket((ws, request, context) => {
  ws.on("message", (message) => {
    ws.send(`echo: ${message}`);
  });
});

const handler = withWebSocket((request) => new Response("Hello, World!"));

serve(handler, { port: 3000 });
```

- `wsHandler(ws, request, context)` is called once per established connection with the [`ws`](https://www.npmjs.com/package/ws) `WebSocket` instance, the original upgrade `Request`, and the handler `context`.
- Because it follows the same `(innerHandler) => handler` shape as other `serve()` middleware, it composes with `compose()`, `@johnhenry/leserve/auth`, and your own router just like anything else.

## API Reference

### Global Types

`Request`, `Response`, `Headers`, `URL`, `URLSearchParams`, and (in modern Node.js) `WebSocket` are standard Node.js runtime globals (Node 18+) — they're available out of the box, and @johnhenry/leserve doesn't add or polyfill them.

## Usage: CLI

A flexible CLI tool for serving JavaScript modules with various options.

### Installation

```bash
npm install -g @johnhenry/leserve
```

### Usage

```bash
leserve <path-to-file> [options]
```

Or

```bash
npx @johnhenry/leserve <path-to-file> [options]
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
import { json, text, form, buffer, respond, error, redirect } from "@johnhenry/leserve/body";
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
import { basicAuth, bearerAuth, apiKeyAuth } from "@johnhenry/leserve/auth";
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
import { compose } from "@johnhenry/leserve/compose";
```

Chain middleware and a base handler — all in the `(Request) => Response` shape used by `serve()` — into a single handler:

```js
const app = compose(withCache(), requireAuth, handler);
serve(app, { port: 3000 });
```

### `compose(...fns)`

- Each middleware has the signature `(next) => (request, ctx) => Response`.
- The last argument is the base handler: `(request, ctx) => Response`.
- Middleware run in the order passed, each wrapping the next, with the base handler innermost — the same composition order used by `onWebSocket()` and `@johnhenry/leserve/auth`.

Like `@johnhenry/leserve/auth` and `onWebSocket()`, `compose()` is designed for the `serve()` model.

## Test Harness

```js
import { testHandler } from "@johnhenry/leserve/test-harness";
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
| `@johnhenry/leserve` or `@johnhenry/leserve/serve` | `serve(handler, options?)`, `onWebSocket(wsHandler)` — Handler-based server (recommended default) |
| `@johnhenry/leserve/genport` | Random port generation |
| `@johnhenry/leserve/body` | `json`, `text`, `form`, `buffer`, `respond`, `error`, `redirect` |
| `@johnhenry/leserve/auth` | `basicAuth`, `bearerAuth`, `apiKeyAuth` — for the `serve()` model |
| `@johnhenry/leserve/compose` | `compose(...fns)` — middleware composition for the `serve()` model |
| `@johnhenry/leserve/test-harness` | `testHandler` — Test `serve()`-style handlers without a server |
| `@johnhenry/leserve/websocket` | `upgradeRawSocket(raw)`, `WEBSOCKET_UPGRADE_RESPONSE` — the low-level primitive `onWebSocket()` is sugar over, for a caller that wants to decide inline within a single request handler whether to upgrade |
| `@johnhenry/leserve/node-request` | `toWebRequest(req, options?)` — converts a raw Node `IncomingMessage` into a Web `Request`, the same conversion `serve()` itself uses |
| `@johnhenry/leserve/trailers` | `setTrailers(response, trailers)`, `getTrailers(response)` — HTTP trailers, which aren't part of the Fetch `Response` model; `serve()` sends them via `res.addTrailers()` after the body finishes |

## Security model

**What leserve guarantees:**

- **Malformed credentials fail as a 401, not a 500.** `basicAuth()`'s
  base64/`user:pass` decoding is wrapped so a non-base64 or colon-less
  `Authorization` header returns `unauthorized("Malformed credentials")`
  instead of letting `atob()`'s synchronous throw propagate past the
  middleware as an uncaught error.
- **`body.mjs`'s `limit` option actually stops reading at the limit.**
  `json()`/`text()`/`buffer()` stream and count bytes, aborting with
  `{ status: 413 }` as soon as the configured size is exceeded, rather than
  buffering the full body first and checking afterward (which would defeat
  the point of a limit against a large payload).
- **A single malformed request cannot crash the process.** Building the Web
  `Request` from a raw `IncomingMessage` (`lib/node-request.mjs`) is wrapped
  so a request-target Node's own HTTP parser lets through but `new URL()`
  rejects becomes a 400, not an uncaught synchronous throw outside any
  handler's `try`/`catch`.
- **Multi-value response headers and mid-stream errors are handled
  correctly**, not silently dropped/swallowed -- repeated `Set-Cookie`
  values all reach the client, and a `ReadableStream` error partway through
  a response is forwarded (`stream/promises`' `pipeline()`) instead of
  crashing the process via an unhandled `'error'` event.

**What is still yours:**

- **`basicAuth`/`bearerAuth`/`apiKeyAuth` only parse and dispatch --
  the `validate` function you supply is where the actual authorization
  decision happens.** A `validate` that returns `true` unconditionally
  (or compares with a non-constant-time `===`, or trusts a value it
  shouldn't) reinstates whatever hole that implies; these factories give
  you a correctly-parsed credential and a 401 on rejection, nothing more.
- **`request.url` (and therefore `.host`/`.origin`) is built from the
  client-supplied `Host` header, unvalidated.** `toWebRequest()`
  (`lib/node-request.mjs`) constructs the request's URL as `new URL(req.url,
  \`http://${req.headers.host}\`)`, falling back to `"localhost"` only if
  the header is absent entirely -- there is no allowlist otherwise. If a
  handler reads `request.url`/`.host`/`.origin` to build absolute links,
  redirects, or a CORS decision, that value is attacker-controlled input
  unless a reverse proxy in front of `serve()` strips/overwrites the
  inbound `Host` header first. (The same construction is reused by
  `@johnhenry/servant` via `leserve/node-request` -- see its own README for
  the identical caveat, stated independently.)
- **TLS is your own certificate/key management.** `serve()`'s `cert`/`key`
  options are passed straight through to Node's `https` server; leserve
  does not provision, rotate, or validate certificates.
- **No built-in rate limiting or lockout** on any of the auth middleware --
  compose your own (`compose(rateLimiter, requireAuth, handler)`) if that
  matters for your deployment.

## Family

leserve is the shared HTTP bridge underneath three other `@johnhenry/*`
packages -- each depends on it for a different slice, not identically.

- **[`@johnhenry/servable`](https://github.com/johnhenry/servable)**
  (and, transitively, **[`@johnhenry/hostable`](https://github.com/johnhenry/hostable)**,
  which is built on servable) -- the Node adapter (`adapters/node`)
  delegates to this package's own `serve()` rather than maintaining a
  second `IncomingMessage`/`ServerResponse` -> `Request`/`Response` bridge.
  `@johnhenry/leserve` is an **optional peer dependency** of servable, only
  needed by that one adapter. servable's own WebSocket support
  (`upgradeWebSocket()`) also delegates to this package's
  `upgradeRawSocket()` on Node specifically, since Node has no built-in
  server-side WebSocket upgrade/framing at all.
- **[`@johnhenry/servant`](https://github.com/johnhenry/servant)** -- a
  separate, self-contained, batteries-included server (routing, middleware,
  WebSocket support, dispatched through a service-worker-style
  `addEventListener('fetch', ...)` API) that does **not** interoperate with
  this package's own `serve()` as a drop-in -- they're independent
  implementations of "a server", and `servant`'s README and this one both
  say so. That said, `servant` genuinely depends on
  `@johnhenry/leserve` in `package.json`, for exactly one thing: `leserve/node-request`'s
  `toWebRequest()`, the same `IncomingMessage` -> `Request` conversion this
  package uses internally (see "What is still yours" above for the
  Host-header caveat that conversion carries into `servant` too).
  `servant` was originally extracted *from* this package's own
  `controls.mjs`/`event.mjs` (see CHANGELOG) before becoming its own
  package.

## License

This project is licensed under the MIT License.
