import { addEventListener, removeEventListener } from "./index.mjs";

// Attach to process object
Object.assign(globalThis, {
  addEventListener,
  removeEventListener,
});
