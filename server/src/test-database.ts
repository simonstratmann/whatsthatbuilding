// A fresh, empty database for one test file, so files running side by side don't share tables.
import pg from "pg";
import { inject } from "vitest";

export async function freshDatabase(): Promise<string> {
  const url = new URL(inject("postgisUrl"));
  const name = `test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const admin = new pg.Client({ connectionString: url.href });
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE ${name}`);
  } finally {
    await admin.end();
  }
  url.pathname = `/${name}`;
  return url.href;
}
