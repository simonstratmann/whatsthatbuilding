import basicSsl from "@vitejs/plugin-basic-ssl";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import { apiPlugin } from "./dev-server/api.ts";

/** The repo root, where .env.local and logs/ live. */
const repoRoot = fileURLToPath(new URL("..", import.meta.url));

export default defineConfig(({ mode }) => {
  // DATABASE_URL, LOD2_CACHE_DIR, OVERPASS_URL and the like from the environment or .env.local,
  // for the API the dev server runs.
  const env = loadEnv(mode, repoRoot, "");
  return {
    envDir: repoRoot,
    // Relative asset paths, so the build runs from any folder.
    base: "./",
    define: { __BUILD_ID__: JSON.stringify(Date.now().toString(36)) },
    build: {
      rollupOptions: {
        input: {
          index: fileURLToPath(new URL("index.html", import.meta.url)),
          // The service worker sits beside index.html under a fixed name, so its scope is the
          // whole app and the browser finds it again after an update.
          sw: fileURLToPath(new URL("src/sw/sw.ts", import.meta.url)),
        },
        output: {
          entryFileNames: (chunk) => (chunk.name === "sw" ? "sw.js" : "assets/[name]-[hash].js"),
        },
      },
    },
    plugins: [
      // Keeps every request made while testing in logs/, under the ID the app shows.
      apiPlugin({ ...env, REQUEST_LOG_DIR: `${repoRoot}logs` }),
      // `--mode https` serves over HTTPS with a self-signed certificate, so a phone on the
      // local network will share its camera and sensors (after accepting the warning).
      ...(mode === "https" ? [basicSsl()] : []),
    ],
  };
});
