import "../event.mjs";
import { start } from "../controls.mjs";
import theresWaldo from "theres-waldo";
import { join } from "path";
const { dir } = theresWaldo(import.meta.url);
const SERVER_LOCATION = "./_events.mjs";
const PORT = 8081;
start({ port: PORT });
import(join(dir, SERVER_LOCATION));
