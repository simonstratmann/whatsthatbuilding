// Starts PostGIS in Docker for the test run, so the LoD2 store's queries run against the real
// thing. Set TEST_DATABASE_URL to use a running server instead.
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import type { TestProject } from "vitest/node";

declare module "vitest" {
  export interface ProvidedContext {
    /** A PostGIS server's admin connection; test-database.ts makes a database per test file in it. */
    postgisUrl: string;
  }
}

export default async function setup(project: TestProject): Promise<(() => Promise<void>) | undefined> {
  if (process.env.TEST_DATABASE_URL) {
    project.provide("postgisUrl", process.env.TEST_DATABASE_URL);
    return undefined;
  }
  const container = await new PostgreSqlContainer("postgis/postgis:17-3.5").start();
  project.provide("postgisUrl", container.getConnectionUri());
  return async () => void (await container.stop());
}
