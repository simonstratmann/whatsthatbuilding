// The production entry point: the PWA and its API on one port. Run with `node src/main.ts`.
import { fileURLToPath } from "node:url";
import { appOptionsFromEnv } from "./config.ts";
import { startServer } from "./server.ts";

const port = Number(process.env.PORT || 8080);
// The PWA's build output; WEB_ROOT overrides it.
const webRoot = process.env.WEB_ROOT || fileURLToPath(new URL("../../web/dist", import.meta.url));

const options = appOptionsFromEnv(process.env);
const server = await startServer({ ...options, webRoot, port });
console.log(`Serving ${webRoot} and the API on ${server.url}`);
console.log(`Request log: ${options.requestLogDir ?? "off"}`);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => void server.close().finally(() => process.exit(0)));
}
