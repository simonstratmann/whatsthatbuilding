// Imports Hamburg's yearly LoD2 building model, replacing the previous import:
//   node server/src/import-hamburg.ts [release zip URL]   (npm run import:hamburg)
// Without a URL it takes the newest release listed on the transparency portal. Reads
// DATABASE_URL and LOD2_CACHE_DIR. Run it again each April when LGV publishes a new release.
import { databaseUrlFromEnv, lod2CacheDirFromEnv } from "./config.ts";
import { importHamburg, newestHamburgRelease } from "./hamburg-import.ts";
import { lod2Store } from "./lod2-store.ts";

const store = lod2Store(databaseUrlFromEnv(process.env));
try {
  const releaseUrl = process.argv[2] || (await newestHamburgRelease());
  await importHamburg({ store, cacheDir: lod2CacheDirFromEnv(process.env), releaseUrl });
} finally {
  await store.close();
}
