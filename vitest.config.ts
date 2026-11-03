import { defineConfig } from "vitest/config";

// One test run over every package; each keeps its tests next to its code.
export default defineConfig({
  test: {
    projects: ["web", "server", "shared"],
  },
});
