# Agent playbook

`@johnhenry/leserve` — a simple HTTP/HTTPS server for Node.js built around
one API, `serve()`: a plain `(Request) => Response` handler with opt-in
WebSocket upgrades, no routing/middleware/event framework attached. Single
package, Node >= 26, `node --test --test-concurrency=1` (`npm test`, runs
`test-serve.mjs`), ships source directly -- no build step. Concurrency is
pinned to 1 deliberately (each test binds a real port); don't drop that flag
to "speed up" a local run.

`CLAUDE.md` in this directory is a symlink to this file.

## The verification loop (before every push)

1. `npm test` -- `node --test --test-concurrency=1 test-serve.mjs`. No test
   here is allowed to SKIP.
2. `npm pack --dry-run` -- read the file list, not just the exit code;
   `files` is `serve.mjs`, `gen-random-port.mjs`, `serve-cold.mjs`,
   `body.mjs`, `compose.mjs`, `test-harness.mjs`, `auth.mjs`, `lib/`,
   `README.md`, `LICENSE`.
3. A genuinely fresh clone:
   `git clone . /tmp/leserve-verifyN && cd $_ && npm ci && npm test`.
   This is the only way to catch "works on my checked-out tree" bugs
   (missing `files` entries, undeclared deps, or the CLI `bin.leserve`
   pointing at a file that isn't actually in `files` -- this has broken
   before).
4. Exercise the CLI once after a `serve()`/CLI-adjacent change:
   `node serve-cold.mjs demo/serve.mjs` (or `npm run demo:serve`), confirm
   it actually listens and serves.
5. Commit, push, close the issue with a comment naming the commit SHA.

CI (`.github/workflows/ci.yml`) runs `npm test`; match it locally.

## Repo-specific gotchas

- **`serve()` accepts both `(handler, options)` and `(options, handler)`
  argument orders** -- the second exists to match `Deno.serve`'s own
  signature and is used internally by the CLI. A change to option parsing
  must handle both call shapes, not just the documented-first one; this has
  silently dropped `options` before when only one order was updated.
- **`onWebSocket()`/`auth.mjs`/`compose()` all share one composition
  shape: `(innerHandler) => (request, ctx) => Response`.** A new piece of
  middleware that doesn't follow this exact shape won't compose with
  `compose()` or the others -- match it, don't invent a parallel shape.
- **A `WebSocketServer({ noServer: true })` instance must be created once,
  at module scope, and reused across every `handleUpgrade()` call** --
  creating a fresh one per upgrade (an easy mistake when factoring upgrade
  logic into a helper) has previously broken plain non-WebSocket `fetch()`
  calls against the same server later in the same run. Real, reproducible
  bug; caught by the test suite, not by reasoning about it.
- **`res.addTrailers()` needs a plain object, not a `Headers` instance** --
  `Headers`' entries live behind an iterator, not own-enumerable
  properties, so handing one directly silently sends zero trailers with no
  error. Convert first.
- **`bin.leserve` points at `serve-cold.mjs`, not a file named `leserve.mjs`**
  -- this is intentional (see CHANGELOG); don't "fix" it without checking
  `files` in `package.json` stays in sync.

## Definition of done

A change is done when all of the following hold, not just when tests pass:

- A regression test exists for any bug fixed.
- Anything the feature does **not** do is stated in the README (or the
  code), not only in an issue comment.
- `CHANGELOG.md` has an entry citing the commit/PR.
- A new auth/middleware factory follows the `(innerHandler) => (request,
  ctx) => Response` shape `basicAuth`/`bearerAuth`/`apiKeyAuth`/
  `onWebSocket()`/`compose()` already share.

## Non-goals

No routing, no middleware framework, no event-based dispatch — those moved
to the separate, independent [`@johnhenry/servant`](https://github.com/johnhenry/servant)
package (see README's `## Family`). This package stays a thin `serve()`
primitive plus small, composable helpers.

## Releases

Bump `version` in `package.json` in a PR, add the `CHANGELOG.md` entry, merge,
then `gh release create v<version>` — the release event triggers
`.github/workflows/publish.yml`, which is idempotent (skips if the version is
already on npm).
