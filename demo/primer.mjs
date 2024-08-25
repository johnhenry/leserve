import "../globals.mjs";
import { start } from "../index.mjs";
const SERVER_LOCATION = "./server.mjs";
const PORT = 8080;
start({ port: PORT });
import(SERVER_LOCATION);
