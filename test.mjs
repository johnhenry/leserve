// event-listener-server.test.js
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { Agent } from "undici";
import WebSocket from "ws";
import { getRandomPort } from "./gen-random-port.mjs";
// Import the server implementation
import "./globals.mjs";
import {
  start,
  stop,
  route,
  use,
  emit,
  createServerSentEvent,
} from "./index.mjs";
addEventListener("start", ({ index, port }) =>
  console.log(`Server ${index} running on port ${port}.`)
);
addEventListener("start", ({ index }) =>
  console.log(`Server ${index} stopped.`)
);
addEventListener("error", ({ message }) =>
  console.error(`Server error: ${message}.`)
);
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

const sseHandler = (event) => {
  if (event.request.url.endsWith("/sse")) {
    const ts = new TransformStream();
    const writer = ts.writable.getWriter();
    writer.write(createServerSentEvent({ message: "Hello SSE" }, "update"));
    writer.close();
    event.respondWith(
      new Response(ts.readable, {
        headers: {
          Connection: "keep-alive",
          "Content-Encoding": "none",
          "Cache-Control": "no-cache, no-transform",
          "Content-Type": "text/event-stream",
        },
      })
    );
    return;
  }
  event.respondWith(new Response("Not Found", { status: 404 }));
};

describe("Event Listener Server Tests", async () => {
  await test("Server start and stop", async () => {
    const port = getRandomPort();
    const server = await start({ port });
    await assert.doesNotReject(fetch(`http://localhost:${port}`));
    await stop(server);
    const isClosed = await isPortClosed(port);
    assert.ok(
      isClosed,
      `Port ${port} should be closed after stopping the server`
    );
  });

  await test("HTTPS server", async () => {
    const port = getRandomPort();
    const httpsOptions = {
      key: `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDYhAyKc91hGMeG
G4hubHNVvqRRKUzKTiAvtJJAN99prmfi4QEwXSYjDbyGeBFa5RY09Q/Y5WZQxaEs
zzsrfTdlEYJx4LaWUF/0WrTHs4KW9RBXKY2eqska6bmGp2dRjQryXrCuTCvxEsOF
mG244IDho0OK/fuTqnlWzpGxs1n/rSZ33+FHksU3jt58Y1mq09o068gXu+4jjZeI
65pTC9HwGNYmk0L+sxfs4+8Dh/8NndfYImWB/+ydbiKuEwhKZKRVkjoltd+OIreo
E5/AcWd9DBIAlVa9gfiGIf77/XcUri7iYElzDwHHO655ed7VusvEO4NGFdGTpzPU
BYMhHaUvAgMBAAECggEAIzjYEW3n2vPSVtlZHcg8EFGDHvDpB8AjMZ+JFd6rqYrb
EOgpmVnjP7CXCrOy9GZwG7gCFqFlk549f1yhnjbbMXCNF+7Gb+LYuUJIRnRyuhFZ
Jyogr78jbWK4RlTVVJ7tOPXOfYxGrwuuYv1OXCpUImC84Xo6guXTTMaDTQqFiYyv
TrtviL2mFnJowoyFzToXky1KjN9CZh0aHcBm8uCXlXmL861btcLFpl9hnCADKZlR
O4aiK+Cz+b/0Sc0qwjcaudjpKyPK9c+cpaP5n8o26dg2ZnjpCmnE9OHmepB7H36T
z3xsE1rK6v0vWN5ajelngBxkRrNaX9BDSZFSRMMbgQKBgQD88G3CQP11qD9MWwpn
CS7tX0WrEXcoULHEO/ET5RO5SxdaWq9lH/jL0x5mJbBGQiOqffr4A7IuSVswqGLW
WEvquAHM6M9MMUk3TkiHesXKcQrI46SxCorfEE/TihcowRqoM25yfmL2+1cK8vQ8
KgpT3LjHCfd6ZwtKSz8i2YRZuwKBgQDbIskeSPzxVZslzA7atJmrE0JHK22Dvd5A
ynwkIC5mfWgoG/ZzX7mC0hAh4geiiXsR1IW89fl7GZUbBksr0D4xdeexp6anPPbE
3fDDZ0JP2tlzqXFdAckC9A43DjoNJHjPNtCmS/mP+Oe4YfNuo2Xu50oGkNd+zE47
IZKcMhVBHQKBgEs0uY3OgQ4grmFnmFo2csuFTlOk58cG5zQvlmiR7iFj4FevKwNo
VDNWXG2GuzjIpY4l0x83Ch2VFhYLmwecTUZG29IvTqOa6+gT0KDnsjOVFN3SQb+a
INxeHz4IiwZFFEX6tNY6GfbRmHna7x+MaHGy6QXVQs4UIVk/slAMWLvNAoGBALn3
ZlhWNpqUPKsx5jVCaNqe6HM/bpwLyI6RiBKcYORHbtoDCP5WcTeND3XBvRr5s0Cp
a6m10TffuQMLL0YKXo1Y8vx4O1zXxs/BTa52dfcQ0dNvK65zcmQYO+wLHcbDeebY
LO/DsBG3eOan8Y+mCT5aeB7kUozf01ApKKN3eUQdAoGAUjblOoxm/e5Rs1J8diP+
cGZEod/x2OsMyav3WbnZxpPvCBS6eZQ965wRzC0F0NWAEriyJaKOXiVkAl6e9rZo
aQTPZsd6nOrcvp3IfCB3Xpr+CneFJdweu2SCnL8ibnxDLGyAsGHQuen8tfPiD5z1
Qe29CWMTv9CaXbywovGU3Hg=
-----END PRIVATE KEY-----`,
      cert: `-----BEGIN CERTIFICATE-----
MIIDbTCCAlWgAwIBAgIUGvbCY7YYDX5zLie33gaYmvn+IaQwDQYJKoZIhvcNAQEL
BQAwRTELMAkGA1UEBhMCQVUxEzARBgNVBAgMClNvbWUtU3RhdGUxITAfBgNVBAoM
GEludGVybmV0IFdpZGdpdHMgUHR5IEx0ZDAgFw0yNDA4MjUwOTIyNTVaGA8yMTI0
MDgyNTA5MjI1NVowRTELMAkGA1UEBhMCQVUxEzARBgNVBAgMClNvbWUtU3RhdGUx
ITAfBgNVBAoMGEludGVybmV0IFdpZGdpdHMgUHR5IEx0ZDCCASIwDQYJKoZIhvcN
AQEBBQADggEPADCCAQoCggEBANiEDIpz3WEYx4YbiG5sc1W+pFEpTMpOIC+0kkA3
32muZ+LhATBdJiMNvIZ4EVrlFjT1D9jlZlDFoSzPOyt9N2URgnHgtpZQX/RatMez
gpb1EFcpjZ6qyRrpuYanZ1GNCvJesK5MK/ESw4WYbbjggOGjQ4r9+5OqeVbOkbGz
Wf+tJnff4UeSxTeO3nxjWarT2jTryBe77iONl4jrmlML0fAY1iaTQv6zF+zj7wOH
/w2d19giZYH/7J1uIq4TCEpkpFWSOiW1344it6gTn8BxZ30MEgCVVr2B+IYh/vv9
dxSuLuJgSXMPAcc7rnl53tW6y8Q7g0YV0ZOnM9QFgyEdpS8CAwEAAaNTMFEwHQYD
VR0OBBYEFAOlT+T8sAwnkKJVLAJetvV3fqTHMB8GA1UdIwQYMBaAFAOlT+T8sAwn
kKJVLAJetvV3fqTHMA8GA1UdEwEB/wQFMAMBAf8wDQYJKoZIhvcNAQELBQADggEB
AHByIGXwJX95XcGlE+DW32AZgJLNKN3drFhzpVqSYZj0Pvzj7k2QdnqG1cqZT1ox
UBX4gc3+e7QX6uaoIqvKpYAob57ptTVCdL5cWf/sJBPC0oq/pIGsPystQur8a95t
jxd3lhTHQMBH5oCcZP0QHNK4R9W/Qgd/4Kf2OxYvXCWJ8MlTrjDNb6axH74fr9xx
nryPiuupyiwNGkYiF6Vvvq8wbQAMydDrPTl7gWMtYfHFjpNK5CRHvu2+2RCHOZD3
0iSlO/cL2MZnGQy5WaUIGXJmPyjFZmLt5XMdE8JUx7XrkowVWHfwWHm3RolUSsPM
VyyNz/1TUWii+PL9b9yswag=
-----END CERTIFICATE-----`,
    };
    const server = await start({ port, https: httpsOptions });
    await assert.doesNotReject(
      fetch(`https://localhost:${port}`, {
        dispatcher: new Agent({
          connect: {
            rejectUnauthorized: false,
          },
        }),
      })
    );
    await stop(server);
  });

  await test("Basic request handling", async () => {
    const port = getRandomPort();
    const BasicRequestHandler = (event) => {
      event.respondWith(new Response("Hello, World!", { status: 200 }));
    };
    addEventListener("fetch", BasicRequestHandler);
    const server = await start({ port });
    const response = await fetch(`http://localhost:${port}`);
    assert.equal(response.status, 200);
    assert.equal(await response.text(), "Hello, World!");
    await stop(server);
    removeEventListener("fetch", BasicRequestHandler);
  });

  await test("Routing", async () => {
    const port = getRandomPort();
    route("GET", "/hello/:name", async (req, params) => {
      return new Response(`Hello, ${params.name}!`, { status: 200 });
    });

    const server = await start({ port });
    const response = await fetch(`http://localhost:${port}/hello/Alice`);
    assert.equal(response.status, 200);
    assert.equal(await response.text(), "Hello, Alice!");

    await stop(server);
  });

  await test("Middleware", async () => {
    const port = getRandomPort();
    let middlewareCalled = false;
    use(async (req, res) => {
      middlewareCalled = true;
      return req;
    });
    const middlewareHandler = (event) => {
      event.respondWith(new Response("Hello, World!", { status: 200 }));
    };

    addEventListener("fetch", middlewareHandler);

    const server = await start({ port });

    await fetch(`http://localhost:${port}`);
    assert.equal(middlewareCalled, true);

    await stop(server);
    removeEventListener("fetch", middlewareHandler);
  });

  await test("WebSocket", async () => {
    const port = getRandomPort();
    return new Promise(async (resolve) => {
      const webSocketHandler = (ws) => {
        ws.on("message", (message) => {
          ws.send(`Echo: ${message}`);
        });
      };
      addEventListener("websocket", webSocketHandler);
      const server = await start({ port });
      const ws = new WebSocket(`ws://localhost:${port}`);
      ws.on("open", () => {
        ws.send("Hello, WebSocket!");
      });
      ws.on("message", (data) => {
        assert.equal(data.toString(), "Echo: Hello, WebSocket!");
        ws.close();
        stop(server).then(resolve);
      });
    });
  });

  await test("Server-Sent Events", async () => {
    // TODO: can I use an EventSource Polyfill?
    const port = getRandomPort();
    addEventListener("fetch", sseHandler);
    const server = await start({ port });
    const response = await fetch(`http://localhost:${port}/sse`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Content-Type"), "text/event-stream");
    const reader = response.body.getReader();
    const { value } = await reader.read();
    const eventData = new TextDecoder().decode(value);
    assert.match(
      eventData,
      /^event: update\ndata: {"message":"Hello SSE"}\n\n$/
    );
    await stop(server);
    removeEventListener("fetch", sseHandler);
  });

  await test("Custom events", async () => {
    let customEventCalled = false;
    const customEventHandler = (data) => {
      customEventCalled = true;
      assert.deepEqual(data, { message: "Custom event data" });
    };
    addEventListener("customEvent", customEventHandler);

    emit("customEvent", { message: "Custom event data" });
    assert.equal(customEventCalled, true);
    removeEventListener("customEvent", customEventHandler);
  });

  await test("Error handling", async () => {
    const port = getRandomPort();
    const fetchHandler = () => {
      throw new Error("Test error");
    };
    addEventListener("fetch", fetchHandler);
    const server = await start({ port });
    const { promise: error, resolve: errorHandler } = Promise.withResolvers();
    addEventListener("error", errorHandler);
    const response = await fetch(`http://localhost:${port}`);
    assert.equal(response.status, 500);
    assert.equal(await response.text(), "Internal Server Error");
    assert.equal((await error).message, "Test error");
    removeEventListener("fetch", fetchHandler);
    removeEventListener("error", errorHandler);
    stop(server);
  });
});
