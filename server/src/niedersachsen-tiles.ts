import type { LatLng } from "@whatisthatbuilding/shared";
import { toUtm32 } from "./utm32.ts";

/**
 * One of LGLN's 1 km LoD2 tiles of Niedersachsen, named by its lower-left corner in UTM32
 * kilometres: east 550, north 5803 is the square 550–551 km E, 5803–5804 km N.
 */
export interface TileKey {
  east: number;
  north: number;
}

/** A box in WGS84 degrees. */
export interface Box {
  west: number;
  south: number;
  east: number;
  north: number;
}

const TILE_METRES = 1000;

/** The tile's file name in LGLN's bucket, without .gml, e.g. "LoD2_32_550_5803_1_ni". */
export function tileName({ east, north }: TileKey): string {
  return `LoD2_32_${east}_${north}_1_ni`;
}

/**
 * The tiles a circle reaches: every tile whose square comes within `radiusMetres` of the
 * centre. Distances are measured in UTM32, which is within 0.1 % of the ground in Niedersachsen.
 */
export function tilesAround(centre: LatLng, radiusMetres: number): TileKey[] {
  const { east, north } = toUtm32(centre);
  const tiles: TileKey[] = [];
  for (let e = Math.floor((east - radiusMetres) / TILE_METRES); e <= Math.floor((east + radiusMetres) / TILE_METRES); e++) {
    for (let n = Math.floor((north - radiusMetres) / TILE_METRES); n <= Math.floor((north + radiusMetres) / TILE_METRES); n++) {
      // From the centre to the nearest point of the square.
      const dx = Math.max(e * TILE_METRES - east, 0, east - (e + 1) * TILE_METRES);
      const dy = Math.max(n * TILE_METRES - north, 0, north - (n + 1) * TILE_METRES);
      if (Math.hypot(dx, dy) <= radiusMetres) tiles.push({ east: e, north: n });
    }
  }
  return tiles;
}

/**
 * The tiles a box touches. The UTM32 grid is slightly turned against lines of longitude, so
 * this takes the grid-aligned box around all four corners, a few tiles more than needed at most.
 */
export function tilesInBox({ west, south, east, north }: Box): TileKey[] {
  const corners = [
    { lat: south, lon: west },
    { lat: south, lon: east },
    { lat: north, lon: east },
    { lat: north, lon: west },
  ].map(toUtm32);
  const kilometre = (metres: number) => Math.floor(metres / TILE_METRES);
  const [eastFrom, eastTo] = [Math.min(...corners.map((c) => c.east)), Math.max(...corners.map((c) => c.east))].map(kilometre) as [number, number];
  const [northFrom, northTo] = [Math.min(...corners.map((c) => c.north)), Math.max(...corners.map((c) => c.north))].map(kilometre) as [number, number];
  const tiles: TileKey[] = [];
  for (let e = eastFrom; e <= eastTo; e++) {
    for (let n = northFrom; n <= northTo; n++) tiles.push({ east: e, north: n });
  }
  return tiles;
}
