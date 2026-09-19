import net from "node:net";

/**
 * Get a free TCP port by asking the OS for one.
 *
 * The previous implementation was `Math.floor(Math.random() * range)` with
 * no collision check whatsoever — it just guessed a number and handed it
 * back. Under concurrent load that guess collides: this package's own test
 * suite runs `test.mjs` and `test-serve.mjs` as two independent processes,
 * each independently calling this ~10-20 times in quick succession, and a
 * random-guess collision between them (one process's `server.listen(port)`
 * failing because the other process is already bound to it) was
 * reproducible in practice, not just theoretical — it left a server
 * dangling (its cleanup skipped because the assertion that would have run
 * it never got there), which kept that test process alive indefinitely,
 * hanging `npm test`.
 *
 * Binding an ephemeral server to port 0 and reading back what the OS
 * assigned is the standard, reliable way to get a genuinely free port
 * (the same technique used by e.g. the `get-port` package). There is an
 * inherent, unavoidable TOCTOU race between releasing the port here and
 * the caller binding to it — another process could in principle grab it
 * in between — but that's true of *any* "find a free port" utility, and is
 * astronomically less likely than the blind-random-guess collisions this
 * replaces.
 *
 * @returns {Promise<number>}
 */
export const genPort = () => {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    // Deliberately *not* `.unref()`'d: this server is only alive for the
    // few ticks it takes to bind and immediately close again, but
    // unref'ing it let Node's event loop consider itself empty and exit
    // before that sequence finished in some scheduling windows — leaving
    // this Promise permanently unresolved (surfaced by Node's test runner
    // as "Promise resolution is still pending but the event loop has
    // already resolved"). It's refed for its whole (very short) lifetime
    // and closed explicitly below, so it can't keep the process alive
    // longer than that.
    server.once("error", reject);
    server.listen(0, () => {
      const { port } = server.address();
      server.close((err) => {
        if (err) reject(err);
        else resolve(port);
      });
    });
  });
};

export default genPort;
