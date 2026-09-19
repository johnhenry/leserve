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

describe("serve()", async () => {
  await test("starts and stops a server", async () => {
    const port = genPort();
    const server = serve((request) => new Response("ok"), { port });
    await assert.doesNotReject(fetch(`http://localhost:${port}/`));
    await server[Symbol.asyncDispose]();
    const closed = await isPortClosed(port);
    assert.ok(closed, `Port ${port} should be closed after disposing the server`);
  });

  await test("also accepts the (options, handler) call order", async () => {
    const port = genPort();
    const server = serve({ port }, () => new Response("ok"));
    const res = await fetch(`http://localhost:${port}/`);
    assert.equal(res.status, 200);
    await server[Symbol.asyncDispose]();
  });

  await test("basic handler round-trip: request in, response out", async () => {
    const port = genPort();
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

    await server[Symbol.asyncDispose]();
  });

  await test("onWebSocket() composes with an inner handler", async () => {
    const port = genPort();
    const fallback = () => new Response("not a websocket", { status: 200 });
    const handler = onWebSocket((ws) => {
      ws.on("message", (message) => {
        ws.send(`echo: ${message}`);
      });
    })(fallback);

    const server = serve(handler, { port });

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

    await server[Symbol.asyncDispose]();
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
