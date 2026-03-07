/**
 * Compose middleware and handlers into a single (Request) => Response handler.
 *
 * Middleware signature: (next) => (request, ctx) => Response
 * Final handler:       (request, ctx) => Response
 *
 * Usage:
 *   import { compose } from "leserve/compose";
 *   const app = compose(withCache(), requireAuth, handler);
 */
export const compose = (...fns) => {
  if (fns.length === 0) throw new Error("compose requires at least one function");
  if (fns.length === 1) return fns[0];

  // The last function is the base handler
  // Each preceding function is middleware that wraps the next
  return fns.reduceRight((next, mw) => mw(next));
};
