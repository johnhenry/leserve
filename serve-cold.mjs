#!/usr/bin/env node

import { join } from "path";
import { parseArgs } from "node:util";
import serve from "./serve.mjs";
import { start } from "./controls.mjs";

const options = {
  port: {
    type: "string",
    short: "p",
    default: "8000",
  },
  export: {
    type: "string",
    short: "e",
    default: "default",
  },
  events: {
    type: "boolean",
    short: "E",
    default: false,
  },
  verbose: {
    type: "boolean",
    short: "V",
    default: false,
  },
  echo: {
    type: "boolean",
    short: "c",
    default: false,
  },
};

const { values, positionals } = parseArgs({ options, allowPositionals: true });

if (!values.echo && positionals.length !== 1) {
  console.error("Usage: cold-serve <path-to-file> [options]");
  process.exit(1);
}

const filePath = join(process.cwd(), positionals[0] || "");
const port = parseInt(values.port, 10);

const caseEvents = async () => {
  await import("./event.mjs");
  if (values.verbose) {
    addEventListener("start", ({ port, index }) => {
      console.log(`Listening on port ${port}; index ${index}.`);
    });
    addEventListener("stop", ({ index }) => {
      console.log(`Server with index ${index} stopped.`);
    });
  }
  start({ port });
  import(filePath);
};

const caseServe = async () => {
  let module;
  try {
    module = await import(filePath);
  } catch {
    module = {};
  }
  const handler = module[values.export];

  if (typeof handler === "function") {
    serve(
      {
        port,
        onListen({ port }) {
          if (values.verbose) {
            console.log(`Listening on port ${port}`);
          }
        },
      },
      handler
    );
  } else {
    if (values.verbose) {
      console.error(
        `Export '${values.export}' is not a function in ${filePath}`
      );
    }
    process.exit(1);
    return;
    // caseEvents();
  }
};

if (values.echo) {
  serve(
    {
      port,
      onListen({ port }) {
        if (values.verbose) {
          console.log(`Echoing on port ${port}`);
        }
      },
    },
    async (request) => {
      const reqObject = {
        method: request.method,
        url: request.url,
        headers: Object.fromEntries(request.headers),
        body: await request.text(),
      };

      const requestJSON = JSON.stringify(reqObject, null, " ");
      if (values.verbose) {
        console.log("requestJSON: ", requestJSON);
      }
      return new Response(requestJSON, {
        status: 200,
        headers: new Headers({
          "content-type": "application/json",
        }),
      });
    }
  );
} else {
  if (!values.events) {
    caseServe();
  } else {
    caseEvents();
  }
}
