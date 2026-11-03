import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    // One PostGIS for the run; see test-database.ts.
    globalSetup: ["./src/test-postgis.global.ts"],
  },
});
