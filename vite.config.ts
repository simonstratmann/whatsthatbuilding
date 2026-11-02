import basicSsl from "@vitejs/plugin-basic-ssl";
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
  // Relative asset paths, so the build runs from any folder on any static HTTPS server.
  base: "./",
  // `--mode https` serves over HTTPS with a self-signed certificate, so a phone on the
  // local network will share its camera and sensors (after accepting the warning).
  plugins: mode === "https" ? [basicSsl()] : [],
}));
