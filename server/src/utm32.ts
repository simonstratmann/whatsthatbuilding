import type { LatLng } from "@whatisthatbuilding/shared";
import proj4 from "proj4";

/** ETRS89 / UTM zone 32N (EPSG:25832), the coordinate system of both states' LoD2 data. */
const utm32 = proj4("+proj=utm +zone=32 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs", "WGS84");

/** A position in UTM32: metres east and north. */
export interface Utm32 {
  east: number;
  north: number;
}

export function fromUtm32({ east, north }: Utm32): LatLng {
  const [lon, lat] = utm32.forward([east, north]) as [number, number];
  return { lat, lon };
}

export function toUtm32({ lat, lon }: LatLng): Utm32 {
  const [east, north] = utm32.inverse([lon, lat]) as [number, number];
  return { east, north };
}
