// test-serve.mjs
//
// Exercises the `serve()` handler-based server path and its supporting
// modules: serve.mjs, onWebSocket, body.mjs, auth.mjs, and compose.mjs.
//
// `test-harness.mjs`'s `testHandler()` is used for the pure `(Request, ctx)
// => Response` middleware tests (body parsing, auth, compose) since those
// don't need a real socket. It is *not* used for the `serve()` start/stop
// and `onWebSocket()` tests below, because those specifically need to
// exercise the real Node `http`/`ws` server plumbing (listening sockets,
// the `duplex: "half"` request body wiring, and the raw-socket WebSocket
// upgrade) that `testHandler()` deliberately bypasses.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import net from "node:net";
import WebSocket from "ws";
import genPort from "./gen-random-port.mjs";
import serve, { onWebSocket } from "./serve.mjs";
import { json, text, form, buffer } from "./body.mjs";
import { basicAuth, bearerAuth, apiKeyAuth } from "./auth.mjs";
import { compose } from "./compose.mjs";
import { testHandler } from "./test-harness.mjs";

const isPortClosed = (port) => {
  return new Promise((resolve) => {
    const server = http.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => {
      resolve(false);
    });
  });
};

/**
 * Send a raw HTTP request over a plain TCP socket and resolve with the
 * status line once the connection closes. Used to exercise request-lines
 * that `fetch()` itself would refuse to construct (e.g. a malformed
 * absolute-form URL), so we can confirm the server degrades to an error
 * response instead of crashing.
 */
const sendRaw = (port, rawRequest) => {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, "localhost", () => {
      socket.write(rawRequest);
    });
    let data = "";
    socket.on("data", (chunk) => (data += chunk.toString()));
    socket.on("close", () => {
      clearTimeout(timer);
      resolve(data);
    });
    socket.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error("timed out waiting for a response"));
    }, 5000);
  });
};

/**
 * Start a `serve()` server and resolve only once it's actually listening.
 * `serve()` itself returns synchronously — `server.listen()` completes
 * asynchronously in the background — so connecting immediately afterward
 * (particularly via a raw socket, which has far less overhead than
 * `fetch()` and can reach the OS before `listen()` has finished) can race
 * a not-yet-listening server and fail with ECONNREFUSED under load.
 */
const serveReady = (handler, options) => {
  let server;
  return new Promise((resolve) => {
    server = serve(handler, {
      ...options,
      onListen: (info) => {
        options?.onListen?.(info);
        resolve(server);
      },
    });
  });
};

describe("serve()", async () => {
  await test("starts and stops a server", async () => {
    const port = await genPort();
    const server = serve((request) => new Response("ok"), { port });
    try {
      await assert.doesNotReject(fetch(`http://localhost:${port}/`));
    } finally {
      await server[Symbol.asyncDispose]();
    }
    const closed = await isPortClosed(port);
    assert.ok(closed, `Port ${port} should be closed after disposing the server`);
  });

  await test("also accepts the (options, handler) call order", async () => {
    const port = await genPort();
    const server = serve({ port }, () => new Response("ok"));
    try {
      const res = await fetch(`http://localhost:${port}/`);
      assert.equal(res.status, 200);
    } finally {
      await server[Symbol.asyncDispose]();
    }
  });

  await test("basic handler round-trip: request in, response out", async () => {
    const port = await genPort();
    const server = serve(
      async (request) => {
        const url = new URL(request.url);
        return new Response(
          JSON.stringify({
            method: request.method,
            pathname: url.pathname,
            body: request.method === "POST" ? await request.text() : null,
          }),
          { status: 201, headers: { "content-type": "application/json" } }
        );
      },
      { port }
    );
    try {
      const res = await fetch(`http://localhost:${port}/hello`, {
        method: "POST",
        body: "payload",
      });
      assert.equal(res.status, 201);
      const data = await res.json();
      assert.deepEqual(data, {
        method: "POST",
        pathname: "/hello",
        body: "payload",
      });
    } finally {
      await server[Symbol.asyncDispose]();
    }
  });

  await test("onWebSocket() composes with an inner handler", async () => {
    const port = await genPort();
    const fallback = () => new Response("not a websocket", { status: 200 });
    const handler = onWebSocket((ws) => {
      ws.on("message", (message) => {
        ws.send(`echo: ${message}`);
      });
    })(fallback);

    const server = serve(handler, { port });
    try {
      // Non-upgrade requests still fall through to the inner handler.
      const res = await fetch(`http://localhost:${port}/`);
      assert.equal(await res.text(), "not a websocket");

      await new Promise((resolve, reject) => {
        const ws = new WebSocket(`ws://localhost:${port}`);
        ws.on("open", () => ws.send("hi"));
        ws.on("message", (data) => {
          try {
            assert.equal(data.toString(), "echo: hi");
            ws.close();
            resolve();
          } catch (err) {
            reject(err);
          }
        });
        ws.on("error", reject);
      });
    } finally {
      await server[Symbol.asyncDispose]();
    }
  });

  await test("a malformed request-target returns 400 instead of crashing the process", async () => {
    const port = await genPort();
    const server = await serveReady((request) => new Response("ok"), { port });
    try {
      // A well-formed HTTP request line whose absolute-form target contains
      // invalid IPv6-bracket syntax. Node's HTTP parser accepts this and
      // hands it straight through as `req.url`, but the WHATWG `URL`
      // constructor throws on it. Regression for: `toWebRequest()` used to
      // be called *outside* the request handler's try/catch, so this single
      // request crashed the entire process instead of getting an error
      // response.
      const response = await sendRaw(
        port,
        "GET http://[::1:bad/ HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n"
      );
      assert.match(response, /^HTTP\/1\.1 400 /);

      // The process (and this server) must still be alive and serving.
      const res = await fetch(`http://localhost:${port}/`);
      assert.equal(res.status, 200);
    } finally {
      await server[Symbol.asyncDispose]();
    }
  });

  await test("repeated response headers (e.g. multiple Set-Cookie) are all sent, not just the last one", async () => {
    const port = await genPort();
    const server = await serveReady(() => {
      const headers = new Headers();
      headers.append("set-cookie", "a=1");
      headers.append("set-cookie", "b=2");
      return new Response("ok", { headers });
    }, { port });
    try {
      const res = await fetch(`http://localhost:${port}/`);
      // `Headers.getSetCookie()` gives back each Set-Cookie value distinctly.
      assert.deepEqual(res.headers.getSetCookie().sort(), ["a=1", "b=2"]);
    } finally {
      await server[Symbol.asyncDispose]();
    }
  });

  await test("a response body stream that errors mid-response does not crash the process", async () => {
    const port = await genPort();
    const server = await serveReady(() => {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("partial-"));
          setTimeout(() => controller.error(new Error("upstream broke")), 20);
        },
      });
      return new Response(stream, { status: 200 });
    }, { port });
    try {
      const res = await fetch(`http://localhost:${port}/`);
      assert.equal(res.status, 200);
      // The connection is terminated once the stream errors; reading the
      // body to completion should reject rather than hang.
      await assert.rejects(res.text());

      // The process (and this server) must still be alive and serving.
      const ok = await fetch(`http://localhost:${port}/`).catch(() => null);
      // The handler always errors on this route, but a *new* request must
      // still be accepted and handled (not have crashed the process).
      assert.ok(ok, "server must still accept new connections");
    } finally {
      await server[Symbol.asyncDispose]();
    }
  });

  await test("a 413 thrown by body.mjs's `limit` option surfaces as a real 413, not a generic 500", async () => {
    const port = await genPort();
    const server = await serveReady(async (request) => {
      await json(request, { limit: 8 });
      return new Response("should not get here");
    }, { port });
    try {
      const res = await fetch(`http://localhost:${port}/`, {
        method: "POST",
        body: JSON.stringify({ a: "x".repeat(100) }),
      });
      assert.equal(res.status, 413);
    } finally {
      await server[Symbol.asyncDispose]();
    }
  });
});

describe("body.mjs", async () => {
  await test("json() parses a JSON body", async () => {
    const request = new Request("http://localhost/", {
      method: "POST",
      body: JSON.stringify({ a: 1 }),
      headers: { "content-type": "application/json" },
    });
    assert.deepEqual(await json(request), { a: 1 });
  });

  await test("text() parses a text body", async () => {
    const request = new Request("http://localhost/", {
      method: "POST",
      body: "hello world",
    });
    assert.equal(await text(request), "hello world");
  });

  await test("form() parses a FormData body", async () => {
    const fd = new FormData();
    fd.set("name", "Ada");
    const request = new Request("http://localhost/", {
      method: "POST",
      body: fd,
    });
    const parsed = await form(request);
    assert.equal(parsed.get("name"), "Ada");
  });

  await test("buffer() parses an ArrayBuffer body", async () => {
    const request = new Request("http://localhost/", {
      method: "POST",
      body: new Uint8Array([1, 2, 3]),
    });
    const buf = await buffer(request);
    assert.deepEqual(new Uint8Array(buf), new Uint8Array([1, 2, 3]));
  });

  await test("json() throws a 413 when the body exceeds `limit`", async () => {
    const request = new Request("http://localhost/", {
      method: "POST",
      body: JSON.stringify({ a: "x".repeat(100) }),
    });
    await assert.rejects(
      json(request, { limit: 8 }),
      (err) => {
        assert.equal(err.status, 413);
        return true;
      }
    );
  });

  await test("text() throws a 413 when the body exceeds `limit`", async () => {
    const request = new Request("http://localhost/", {
      method: "POST",
      body: "x".repeat(100),
    });
    await assert.rejects(
      text(request, { limit: 8 }),
      (err) => {
        assert.equal(err.status, 413);
        return true;
      }
    );
  });

  await test("json() aborts a streamed body as soon as `limit` is exceeded, without buffering the rest", async () => {
    // Regression for: the old implementation called `request.arrayBuffer()`
    // — which fully drains and buffers the entire body — *before* checking
    // its size against `limit`. That defeats the point of a limit for
    // exactly the case it exists to guard against: a large/DoS-sized
    // payload. This asserts the body's reader is read only once (the
    // first, over-limit chunk) and then cancelled, rather than drained to
    // completion.
    let pullCount = 0;
    let cancelled = false;
    const oversizedChunk = new Uint8Array(16); // exceeds the limit below

    const stream = new ReadableStream({
      pull(controller) {
        pullCount++;
        if (pullCount > 1) {
          // Should never be reached if the limit is enforced while
          // streaming instead of after fully buffering.
          controller.error(new Error("must not pull more chunks after the limit is exceeded"));
          return;
        }
        controller.enqueue(oversizedChunk);
      },
      cancel() {
        cancelled = true;
      },
    });

    const request = new Request("http://localhost/", {
      method: "POST",
      body: stream,
      duplex: "half",
    });

    await assert.rejects(json(request, { limit: 8 }), (err) => {
      assert.equal(err.status, 413);
      return true;
    });
    assert.equal(pullCount, 1, "must not read more of the body after exceeding the limit");
    assert.equal(cancelled, true, "the body reader must be cancelled once the limit is exceeded");
  });
});

describe("auth.mjs", async () => {
  const ok = () => new Response("ok", { status: 200 });

  await test("basicAuth rejects unauthenticated requests and passes through authenticated ones", async () => {
    const app = testHandler(
      basicAuth(async (username, password) => username === "admin" && password === "secret")(ok)
    );

    const unauth = await app.get("/");
    assert.equal(unauth.status, 401);

    const good = await app.get("/", {
      authorization: `Basic ${Buffer.from("admin:secret").toString("base64")}`,
    });
    assert.equal(good.status, 200);

    const bad = await app.get("/", {
      authorization: `Basic ${Buffer.from("admin:wrong").toString("base64")}`,
    });
    assert.equal(bad.status, 401);
  });

  await test("basicAuth rejects malformed credentials (bad base64, or no colon) with 401, not a crash", async () => {
    // Regression for: `atob()` on a non-base64 payload throws synchronously.
    // Since `basicAuth`'s wrapper is an `async` function, that became a
    // rejected promise that propagated past this middleware uncaught
    // (surfacing as a generic 500 upstream) instead of the 401 a malformed
    // credential should produce.
    const app = testHandler(basicAuth(async () => true)(ok));

    const badBase64 = await app.get("/", { authorization: "Basic %%%not-base64%%%" });
    assert.equal(badBase64.status, 401);

    // Valid base64, but no ":" separator — not valid "user:pass" per RFC 7617.
    const noColon = await app.get("/", {
      authorization: `Basic ${Buffer.from("nocolonhere").toString("base64")}`,
    });
    assert.equal(noColon.status, 401);
  });

  await test("bearerAuth rejects unauthenticated requests and passes through authenticated ones", async () => {
    const app = testHandler(bearerAuth(async (token) => token === "secret-token")(ok));

    const unauth = await app.get("/");
    assert.equal(unauth.status, 401);

    const good = await app.get("/", { authorization: "Bearer secret-token" });
    assert.equal(good.status, 200);

    const bad = await app.get("/", { authorization: "Bearer wrong-token" });
    assert.equal(bad.status, 401);
  });

  await test("apiKeyAuth rejects unauthenticated requests and passes through authenticated ones", async () => {
    const app = testHandler(apiKeyAuth(async (key) => key === "the-key")(ok));

    const unauth = await app.get("/");
    assert.equal(unauth.status, 401);

    const good = await app.get("/", { "x-api-key": "the-key" });
    assert.equal(good.status, 200);

    const bad = await app.get("/", { "x-api-key": "wrong-key" });
    assert.equal(bad.status, 401);
  });
});

describe("compose()", async () => {
  await test("chains multiple middleware in order around the base handler", async () => {
    const calls = [];

    const mwA = (next) => async (request, ctx) => {
      calls.push("a-before");
      const res = await next(request, ctx);
      calls.push("a-after");
      return res;
    };

    const mwB = (next) => async (request, ctx) => {
      calls.push("b-before");
      const res = await next(request, ctx);
      calls.push("b-after");
      return res;
    };

    const base = async (request, ctx) => {
      calls.push("base");
      return new Response("done");
    };

    const app = testHandler(compose(mwA, mwB, base));
    const res = await app.get("/");

    assert.equal(await res.text(), "done");
    assert.deepEqual(calls, ["a-before", "b-before", "base", "b-after", "a-after"]);
  });

  await test("with a single function returns it unchanged", () => {
    const handler = () => new Response("solo");
    assert.equal(compose(handler), handler);
  });
});
