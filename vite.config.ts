import basicSsl from "@vitejs/plugin-basic-ssl";
import { defineConfig, loadEnv } from "vite";
import { overpassProxy } from "./dev-server/overpass-proxy.ts";
import { requestLogPlugin } from "./dev-server/request-log.ts";

/**
 * Host names the preview server answers to, from ALLOWED_HOSTS (comma-separated), for the
 * dev-latest image behind a reverse proxy. Unset keeps Vite's default of local names only.
 */
const allowedHosts = process.env.ALLOWED_HOSTS?.split(",").map((host) => host.trim()).filter(Boolean);

export default defineConfig(({ mode }) => {
  // OVERPASS_URL from the environment or .env.local; server-side only, never in the bundle.
  const proxy = overpassProxy(loadEnv(mode, process.cwd(), "").OVERPASS_URL);
  return {
    // Relative asset paths, so the build runs from any folder on any static HTTPS server.
    base: "./",
    plugins: [
      // Keeps every request the app makes while testing in logs/, under the ID it shows.
      requestLogPlugin("logs"),
      // `--mode https` serves over HTTPS with a self-signed certificate, so a phone on the
      // local network will share its camera and sensors (after accepting the warning).
      ...(mode === "https" ? [basicSsl()] : []),
    ],
    server: { proxy },
    preview: { proxy, ...(allowedHosts?.length ? { allowedHosts } : {}) },
  };
});
