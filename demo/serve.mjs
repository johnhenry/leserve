import serve from "../serve.mjs";
import theresWaldo from "theres-waldo";
import { join } from "path";
const { dir } = theresWaldo(import.meta.url);
const HANDLER_LOCATION = "./_serve.mjs";
const EXPORT = "default";
const PORT = 8080;
const handler = await import(join(dir, HANDLER_LOCATION)).then(
  (module) => module[EXPORT]
);
serve({ port: PORT }, handler);
