import basicSsl from "@vitejs/plugin-basic-ssl";
import { defineConfig } from "vite";
import { requestLogPlugin } from "./dev-server/request-log";

export default defineConfig(({ mode }) => ({
  // Relative asset paths, so the build runs from any folder on any static HTTPS server.
  base: "./",
  plugins: [
    // Keeps every request the app makes while testing in logs/, under the ID it shows.
    requestLogPlugin("logs"),
    // `--mode https` serves over HTTPS with a self-signed certificate, so a phone on the
    // local network will share its camera and sensors (after accepting the warning).
    ...(mode === "https" ? [basicSsl()] : []),
  ],
}));
