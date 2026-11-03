import type { IncomingMessage, ServerResponse } from "node:http";
import { getRequestListener } from "@hono/node-server";
import { appOptionsFromEnv } from "@whatisthatbuilding/server/config";
import { createApp } from "@whatisthatbuilding/server/server";
import type { Plugin } from "vite";

/**
 * Serves the server's API (/api/*) from the dev and preview servers, so `npm run dev` gives
 * the PWA with hot reload and the same `/api/identify` the phone uses, in one process.
 * Changes to the server code need a restart.
 */
export function apiPlugin(env: Partial<Record<string, string>>): Plugin {
  // Made on first use, so `vite build` never reads the server's settings.
  let listener: ReturnType<typeof getRequestListener> | undefined;
  const handle = (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (!req.url?.startsWith("/api/")) return next();
    listener ??= getRequestListener(createApp(appOptionsFromEnv(env)).fetch);
    void listener(req, res);
  };
  return {
    name: "api",
    configureServer: (server) => void server.middlewares.use(handle),
    configurePreviewServer: (server) => void server.middlewares.use(handle),
  };
}
