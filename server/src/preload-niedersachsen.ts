// Loads every Niedersachsen LoD2 tile in a box, so Snapshots there never wait for a download:
//   node server/src/preload-niedersachsen.ts <west> <south> <east> <north>
//   npm run preload:niedersachsen -- 9.65 52.32 9.85 52.43        (Hannover, about 200 tiles)
// The box is in WGS84 degrees. Tiles loaded already are skipped, so a run that stopped part-way
// can simply be run again. Reads DATABASE_URL and LOD2_CACHE_DIR.
import { databaseUrlFromEnv, lod2CacheDirFromEnv } from "./config.ts";
import { lod2Store } from "./lod2-store.ts";
import { niedersachsenLoader } from "./niedersachsen-loader.ts";
import { tilesInBox, type Box } from "./niedersachsen-tiles.ts";

const [west, south, east, north] = process.argv.slice(2).map(Number);
const box = { west, south, east, north } as Box;
if (![west, south, east, north].every((n) => n !== undefined && Number.isFinite(n)) || west! >= east! || south! >= north!) {
  console.error("Usage: preload-niedersachsen.ts <west> <south> <east> <north>   (WGS84 degrees)");
  process.exit(2);
}

const store = lod2Store(databaseUrlFromEnv(process.env));
try {
  const loader = niedersachsenLoader({ store, cacheDir: lod2CacheDirFromEnv(process.env) });
  console.log(`${tilesInBox(box).length} tiles in the box`);
  const { loaded, missing, skipped, failed } = await loader.preload(box);
  console.log(`Loaded ${loaded} tiles; ${skipped} were in already, ${missing} are outside Niedersachsen, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
} finally {
  await store.close();
}
