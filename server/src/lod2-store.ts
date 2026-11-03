import type { Footprint, LatLng } from "@whatisthatbuilding/shared";
import pg from "pg";
import type { FootprintSource } from "./identification.ts";
import type { Lod2Tile } from "./lod2-parser.ts";

/** Which state's LoD2 model a tile belongs to; a new import replaces all tiles of its dataset. */
export type Lod2Dataset = "hamburg" | "niedersachsen";

/** The LoD2 building model in PostGIS: the Footprint source for identification, and where imports go. */
export interface Lod2Store extends FootprintSource {
  /**
   * Replaces every tile of `dataset`, and the buildings in them, with `tiles`, in one transaction:
   * until it commits, and if it fails, the previous import stays in use.
   */
  replaceTiles(dataset: Lod2Dataset, tiles: AsyncIterable<Lod2Tile>): Promise<{ tiles: number; buildings: number }>;
  close(): Promise<void>;
}

/** Any key will do, as long as every process creating the schema takes the same one. */
const SCHEMA_LOCK = 62_003;

const SCHEMA = `
  CREATE EXTENSION IF NOT EXISTS postgis;
  CREATE TABLE IF NOT EXISTS lod2_tile (
    name text PRIMARY KEY,
    dataset text NOT NULL,
    extent geometry(Polygon, 4326) NOT NULL,
    imported_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS lod2_tile_extent ON lod2_tile USING gist (extent);
  CREATE INDEX IF NOT EXISTS lod2_tile_dataset ON lod2_tile (dataset);
  CREATE TABLE IF NOT EXISTS footprint (
    id text PRIMARY KEY,
    tile text NOT NULL REFERENCES lod2_tile (name) ON DELETE CASCADE,
    outline geometry(MultiPolygon, 4326) NOT NULL,
    centre geometry(Point, 4326) NOT NULL,
    height_metres double precision,
    function_code text,
    street text,
    house_number text,
    city text
  );
  -- Distances in metres need geography; the index has to be on the same expression.
  CREATE INDEX IF NOT EXISTS footprint_outline ON footprint USING gist ((outline::geography));
  CREATE INDEX IF NOT EXISTS footprint_tile ON footprint (tile);
`;

interface FootprintRow {
  id: string;
  outline: string;
  lat: number;
  lon: number;
  height_metres: number | null;
  function_code: string | null;
  street: string | null;
  house_number: string | null;
  city: string | null;
}

/** Connects to PostGIS; the schema is created on first use if it isn't there yet. */
export function lod2Store(databaseUrl: string): Lod2Store {
  const pool = new pg.Pool({ connectionString: databaseUrl });
  // An idle client losing its connection must not take the server down; the next query reconnects.
  pool.on("error", (error) => console.error("[lod2-store]", error));

  let schema: Promise<void> | undefined;
  const ready = () => {
    schema ??= inTransaction(pool, async (client) => {
      await client.query("SELECT pg_advisory_xact_lock($1)", [SCHEMA_LOCK]);
      await client.query(SCHEMA);
    }).catch((error: unknown) => {
      schema = undefined;
      throw error;
    });
    return schema;
  };

  return {
    async covers({ lat, lon }) {
      await ready();
      const { rows } = await pool.query<{ covered: boolean }>(
        "SELECT EXISTS (SELECT 1 FROM lod2_tile WHERE ST_Intersects(extent, ST_SetSRID(ST_MakePoint($1, $2), 4326))) AS covered",
        [lon, lat],
      );
      return rows[0]?.covered ?? false;
    },

    async footprintsAround({ lat, lon }, radiusMetres) {
      await ready();
      const { rows } = await pool.query<FootprintRow>(
        `SELECT id, ST_AsGeoJSON(outline) AS outline, ST_Y(centre) AS lat, ST_X(centre) AS lon,
                height_metres, function_code, street, house_number, city
           FROM footprint
          WHERE ST_DWithin(outline::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3)`,
        [lon, lat, radiusMetres],
      );
      return rows.map(toFootprint);
    },

    async replaceTiles(dataset, tiles) {
      await ready();
      return inTransaction(pool, async (client) => {
        await client.query("DELETE FROM lod2_tile WHERE dataset = $1", [dataset]);
        let tileCount = 0;
        let buildingCount = 0;
        for await (const tile of tiles) {
          buildingCount += await insertTile(client, dataset, tile);
          tileCount += 1;
        }
        return { tiles: tileCount, buildings: buildingCount };
      });
    },

    close: () => pool.end(),
  };
}

/** Stores the tile and its buildings; returns how many buildings went in. */
async function insertTile(client: pg.PoolClient, dataset: Lod2Dataset, { name, extent, buildings }: Lod2Tile): Promise<number> {
  await client.query(
    "INSERT INTO lod2_tile (name, dataset, extent) VALUES ($1, $2, ST_SetSRID(ST_GeomFromGeoJSON($3), 4326))",
    [name, dataset, JSON.stringify({ type: "Polygon", coordinates: [closed(extent)] })],
  );
  const stored = buildings.filter((b) => b.rings.length > 0);
  if (stored.length === 0) return 0;
  // One statement per tile: each column goes in as an array.
  const { rowCount } = await client.query(
    `INSERT INTO footprint (id, tile, outline, centre, height_metres, function_code, street, house_number, city)
     SELECT id, $1, outline, ST_Centroid(outline), height_metres, function_code, street, house_number, city
       FROM (SELECT id, ST_SetSRID(ST_GeomFromGeoJSON(outline), 4326) AS outline,
                    height_metres, function_code, street, house_number, city
               FROM unnest($2::text[], $3::text[], $4::float8[], $5::text[], $6::text[], $7::text[], $8::text[])
                 AS b (id, outline, height_metres, function_code, street, house_number, city)) AS parsed
     -- A building on a tile boundary could be in both tiles; the first one counts.
     ON CONFLICT (id) DO NOTHING`,
    [
      name,
      stored.map((b) => b.id),
      stored.map((b) => JSON.stringify({ type: "MultiPolygon", coordinates: b.rings.map((ring) => [closed(ring)]) })),
      stored.map((b) => b.heightMetres ?? null),
      stored.map((b) => b.functionCode ?? null),
      stored.map((b) => b.address?.street ?? null),
      stored.map((b) => b.address?.houseNumber ?? null),
      stored.map((b) => b.address?.city ?? null),
    ],
  );
  return rowCount ?? 0;
}

function toFootprint(row: FootprintRow): Footprint {
  const outline = JSON.parse(row.outline) as { coordinates: [number, number][][][] };
  const address = {
    ...(row.street ? { street: row.street } : {}),
    ...(row.house_number ? { houseNumber: row.house_number } : {}),
    ...(row.city ? { city: row.city } : {}),
  };
  return {
    id: row.id,
    // The outer ring of each polygon, without its closing point.
    rings: outline.coordinates.map(([outer]) => (outer ?? []).slice(0, -1).map(([lon, lat]) => ({ lat, lon }))),
    centre: { lat: row.lat, lon: row.lon },
    ...(row.height_metres !== null ? { heightMetres: row.height_metres } : {}),
    ...(row.function_code ? { functionCode: row.function_code } : {}),
    ...(Object.keys(address).length > 0 ? { address } : {}),
  };
}

/** A ring as GeoJSON wants it: [lon, lat] pairs, ending where it starts. */
function closed(ring: LatLng[]): [number, number][] {
  const coordinates = ring.map(({ lat, lon }): [number, number] => [lon, lat]);
  return [...coordinates, coordinates[0]!];
}

async function inTransaction<T>(pool: pg.Pool, work: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
