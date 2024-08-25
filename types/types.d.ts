import { Server } from "http";

interface ServeOptions {
  port?: number;
  hostname?: string;
  cert?: string | Buffer;
  key?: string | Buffer;
}

type Handler = (
  request: Request,
  ...rest: any[]
) => Response | Promise<Response>;

declare function serve(handler: Handler): Server;
declare function serve(options: ServeOptions, handler: Handler): Server;

export = serve;
