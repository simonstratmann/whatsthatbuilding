import type { Address, Footprint, LatLng, SurfaceKind } from "@whatisthatbuilding/shared";
import { SaxesParser, type SaxesTagNS } from "saxes";
import { fromUtm32 } from "./utm32.ts";

/** A point of the LoD2 model as it gives it: metres east and north in UTM32, and its elevation. */
export type Utm32Point = [east: number, north: number, elevation: number];

/** One surface of a Building Shell, still in the LoD2 model's coordinates. */
export interface Lod2Surface {
  kind: SurfaceKind;
  /** The outer ring, without its closing point. */
  ring: Utm32Point[];
}

/** A building as the LoD2 model describes it; the store adds the centre. */
export type Lod2Building = Omit<Footprint, "centre" | "name"> & {
  /** Its walls, roof and ground, and those of its parts; absent when the model has none in 3D. */
  shell?: Lod2Surface[];
};

/** One tile of the LoD2 building model: a 1 km square of UTM32 and the buildings in it. */
export interface Lod2Tile {
  /** The tile's name, e.g. "LoD2_32_565_5933_1_HH". */
  name: string;
  /** The tile's square: south-west, south-east, north-east, north-west corner. */
  extent: LatLng[];
  buildings: Lod2Building[];
}

const GML = "http://www.opengis.net/gml";
const CORE = "http://www.opengis.net/citygml/1.0";
const BLDG = "http://www.opengis.net/citygml/building/1.0";
const XAL = "urn:oasis:names:tc:ciq:xsdschema:xAL:2.0";

interface BuildingInProgress {
  id: string;
  rings: LatLng[][];
  shell: Lod2Surface[];
  /** Height, function and addresses of the building itself, then of each of its parts. */
  heights: number[];
  functionCodes: string[];
  addresses: Address[];
}

/**
 * Reads one tile of CityGML 1.0 in the AdV LoD2 profile, as LGLN and LGV Hamburg publish it.
 * A building's Footprint is the outer rings of its ground surfaces (and those of its parts),
 * reprojected from EPSG:25832 to WGS84 on the ground plane: the coordinates' elevations are
 * dropped, and the building's height comes from its measuredHeight. Its Shell is the outer
 * rings of its wall, roof and ground surfaces (and those of its parts), kept as the model
 * gives them: UTM32 metres with their elevations.
 */
export function parseLod2Tile(gml: string): Lod2Tile {
  const parser = new SaxesParser({ xmlns: true });
  /** Namespaced names of the open elements, outermost first, e.g. "bldg:Building". */
  const open: string[] = [];
  let text = "";
  let srsDimension = 3;

  let name = "";
  let lowerCorner: number[] | undefined;
  let upperCorner: number[] | undefined;
  const buildings: Lod2Building[] = [];
  let building: BuildingInProgress | undefined;
  let address: Address | undefined;

  const inside = (element: string) => open.includes(element);

  parser.on("opentag", (tag: SaxesTagNS) => {
    const element = qualified(tag);
    open.push(element);
    text = "";
    if (element === "bldg:Building" && !building) {
      building = { id: attribute(tag, GML, "id") ?? "", rings: [], shell: [], heights: [], functionCodes: [], addresses: [] };
    } else if (element === "bldg:address" && building) {
      address = {};
    } else if (element === "gml:posList") {
      srsDimension = Number(attribute(tag, "", "srsDimension") ?? 3);
    }
  });

  parser.on("text", (chunk) => {
    text += chunk;
  });

  parser.on("closetag", () => {
    const element = open.pop()!;
    const parent = open.at(-1);
    const value = text.trim();
    text = "";

    if (!building) {
      if (element === "gml:name" && parent === "core:CityModel") name = value;
      else if (element === "gml:lowerCorner" && inside("core:CityModel")) lowerCorner = numbers(value);
      else if (element === "gml:upperCorner" && inside("core:CityModel")) upperCorner = numbers(value);
      return;
    }

    switch (element) {
      case "gml:posList": {
        // Only outer rings of polygons; holes and the terrain intersection's lines are left out.
        if (parent !== "gml:LinearRing" || open.at(-2) !== "gml:exterior") break;
        const kind = surfaceKind(open);
        if (!kind) break;
        const coordinates = numbers(value);
        if (kind === "ground") building.rings.push(withoutClosingPoint(positions(coordinates, srsDimension)));
        if (srsDimension === 3) {
          const ring = withoutClosingPoint3d(points3d(coordinates));
          if (ring.length >= 3) building.shell.push({ kind, ring });
        }
        break;
      }
      case "bldg:measuredHeight":
        if (value) building.heights.push(Number(value));
        break;
      case "bldg:function":
        if (value) building.functionCodes.push(value);
        break;
      case "xAL:ThoroughfareName":
        if (address && value) address.street = value;
        break;
      case "xAL:ThoroughfareNumber":
        if (address && value) address.houseNumber = value;
        break;
      case "xAL:LocalityName":
        if (address && value) address.city = value;
        break;
      case "bldg:address":
        if (address && Object.keys(address).length > 0) building.addresses.push(address);
        address = undefined;
        break;
      case "bldg:Building":
        buildings.push(finish(building));
        building = undefined;
        break;
    }
  });

  parser.write(gml).close();

  if (!lowerCorner || !upperCorner) throw new Error(`LoD2 tile ${name || "(unnamed)"} has no extent`);
  const [west, south] = lowerCorner as [number, number];
  const [east, north] = upperCorner as [number, number];
  return {
    name,
    extent: [toLatLng(west, south), toLatLng(east, south), toLatLng(east, north), toLatLng(west, north)],
    buildings,
  };
}

/** Which kind of surface the open elements are inside, if any; closure surfaces aren't drawn. */
function surfaceKind(open: string[]): SurfaceKind | undefined {
  for (let i = open.length - 1; i >= 0; i--) {
    switch (open[i]) {
      case "bldg:WallSurface":
        return "wall";
      case "bldg:RoofSurface":
        return "roof";
      case "bldg:GroundSurface":
        return "ground";
      case "bldg:Building":
      case "bldg:BuildingPart":
        return undefined;
    }
  }
  return undefined;
}

function finish({ id, rings, shell, heights, functionCodes, addresses }: BuildingInProgress): Lod2Building {
  const heightMetres = heights.length > 0 ? Math.max(...heights) : undefined;
  // A corner building has an address on each street; the first with a street names it.
  const address = addresses.find((a) => a.street) ?? addresses[0];
  return {
    id,
    rings: rings.filter((ring) => ring.length >= 3),
    ...(shell.length > 0 ? { shell } : {}),
    ...(heightMetres !== undefined ? { heightMetres } : {}),
    ...(functionCodes[0] ? { functionCode: functionCodes[0] } : {}),
    ...(address ? { address } : {}),
  };
}

const PREFIXES: Record<string, string> = { [GML]: "gml", [CORE]: "core", [BLDG]: "bldg", [XAL]: "xAL" };

/** The element's name with the prefix this module uses for its namespace, whatever the file calls it. */
function qualified(tag: SaxesTagNS): string {
  const prefix = PREFIXES[tag.uri];
  return prefix ? `${prefix}:${tag.local}` : `{${tag.uri}}${tag.local}`;
}

function attribute(tag: SaxesTagNS, uri: string, local: string): string | undefined {
  return Object.values(tag.attributes).find((a) => a.uri === uri && a.local === local)?.value;
}

function numbers(value: string): number[] {
  return value.split(/\s+/).filter(Boolean).map(Number);
}

function positions(coordinates: number[], dimension: number): LatLng[] {
  const result: LatLng[] = [];
  for (let i = 0; i + 1 < coordinates.length; i += dimension) {
    result.push(toLatLng(coordinates[i]!, coordinates[i + 1]!));
  }
  return result;
}

function points3d(coordinates: number[]): Utm32Point[] {
  const result: Utm32Point[] = [];
  for (let i = 0; i + 2 < coordinates.length; i += 3) result.push([coordinates[i]!, coordinates[i + 1]!, coordinates[i + 2]!]);
  return result;
}

function withoutClosingPoint3d(ring: Utm32Point[]): Utm32Point[] {
  const first = ring[0];
  const last = ring.at(-1);
  const closes = ring.length > 1 && first && last && first.every((value, i) => value === last[i]);
  return closes ? ring.slice(0, -1) : ring;
}

function toLatLng(east: number, north: number): LatLng {
  return fromUtm32({ east, north });
}

function withoutClosingPoint(ring: LatLng[]): LatLng[] {
  const first = ring[0];
  const last = ring.at(-1);
  return ring.length > 1 && first && last && first.lat === last.lat && first.lon === last.lon ? ring.slice(0, -1) : ring;
}
