import type { Address, Footprint, LatLng } from "@whatisthatbuilding/shared";
import proj4 from "proj4";
import { SaxesParser, type SaxesTagNS } from "saxes";

/** A building as the LoD2 model describes it; the store adds the centre. */
export type Lod2Building = Omit<Footprint, "centre" | "name">;

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

/** ETRS89 / UTM zone 32N, the coordinate system of both states' LoD2 data. */
const toWgs84 = proj4("+proj=utm +zone=32 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs", "WGS84");

interface BuildingInProgress {
  id: string;
  rings: LatLng[][];
  /** Height, function and addresses of the building itself, then of each of its parts. */
  heights: number[];
  functionCodes: string[];
  addresses: Address[];
}

/**
 * Reads one tile of CityGML 1.0 in the AdV LoD2 profile, as LGLN and LGV Hamburg publish it.
 * A building's Footprint is the outer rings of its ground surfaces (and those of its parts),
 * reprojected from EPSG:25832 to WGS84 on the ground plane: the coordinates' elevations are
 * dropped, and the building's height comes from its measuredHeight.
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
      building = { id: attribute(tag, GML, "id") ?? "", rings: [], heights: [], functionCodes: [], addresses: [] };
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
      case "gml:posList":
        if (inside("bldg:GroundSurface") && parent === "gml:LinearRing" && open.at(-2) === "gml:exterior") {
          building.rings.push(withoutClosingPoint(positions(numbers(value), srsDimension)));
        }
        break;
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

function finish({ id, rings, heights, functionCodes, addresses }: BuildingInProgress): Lod2Building {
  const heightMetres = heights.length > 0 ? Math.max(...heights) : undefined;
  // A corner building has an address on each street; the first with a street names it.
  const address = addresses.find((a) => a.street) ?? addresses[0];
  return {
    id,
    rings: rings.filter((ring) => ring.length >= 3),
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

function toLatLng(east: number, north: number): LatLng {
  const [lon, lat] = toWgs84.forward([east, north]) as [number, number];
  return { lat, lon };
}

function withoutClosingPoint(ring: LatLng[]): LatLng[] {
  const first = ring[0];
  const last = ring.at(-1);
  return ring.length > 1 && first && last && first.lat === last.lat && first.lon === last.lon ? ring.slice(0, -1) : ring;
}
