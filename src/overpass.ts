import type { Footprint, FootprintSource, LatLng } from "./identification";


type OsmTags = Partial<Record<string, string>>;

interface OverpassWay {
  type: "way";
  id: number;
  geometry?: LatLng[];
  tags?: OsmTags;
}

interface OverpassRelation {
  type: "relation";
  id: number;
  members?: { type: string; role: string; geometry?: LatLng[] }[];
  tags?: OsmTags;
}

type OverpassElement = OverpassWay | OverpassRelation;

/**
 * Where the browser sends Overpass queries: the app's own host, which forwards them to the
 * Overpass server named by OVERPASS_URL (nginx in the production image, Vite otherwise).
 * See docs/adr/0002-proxy-overpass-through-the-app-host.md.
 */
export const OVERPASS_PATH = "/api/interpreter";

export interface OverpassOptions {
  /** The Overpass interpreter endpoint; defaults to the app host's proxy. */
  url?: string;
  fetchFn?: typeof fetch;
}

/** Footprints from OpenStreetMap, fetched live from an Overpass API server. */
export function overpassFootprintSource({
  url = OVERPASS_PATH,
  fetchFn = fetch.bind(globalThis),
}: OverpassOptions = {}): FootprintSource {
  return {
    async footprintsAround(centre, radiusMetres) {
      const around = `around:${Math.round(radiusMetres)},${centre.lat},${centre.lon}`;
      const query = `[out:json][timeout:25];
(
  way["building"](${around});
  relation["building"]["type"="multipolygon"](${around});
);
out geom;`;

      const response = await fetchFn(url, {
        method: "POST",
        body: new URLSearchParams({ data: query }),
      });
      if (!response.ok) throw new Error(`Overpass request failed: ${response.status}`);

      const { elements } = (await response.json()) as { elements: OverpassElement[] };
      return elements.flatMap(toFootprint);
    },
  };
}

function toFootprint(element: OverpassElement): Footprint[] {
  const rings =
    element.type === "way"
      ? [element.geometry ?? []]
      : joinIntoRings(
          (element.members ?? [])
            .filter((m) => m.type === "way" && m.role === "outer")
            .map((m) => m.geometry ?? []),
        );

  const usable = rings.map(withoutClosingPoint).filter((ring) => ring.length >= 3);
  if (usable.length === 0) return [];

  const tags = element.tags ?? {};
  const street = tags["addr:street"];
  const houseNumber = tags["addr:housenumber"];
  return [
    {
      id: `${element.type}/${element.id}`,
      rings: usable,
      centre: centreOf(usable),
      ...(tags.name ? { name: tags.name } : {}),
      ...(street || houseNumber ? { address: { street, houseNumber } } : {}),
    },
  ];
}

/**
 * The area-weighted centroid of the rings, so a building made of a big hall and a small
 * annex is centred on the hall. Degrees are treated as flat; a building is too small to mind.
 */
function centreOf(rings: LatLng[][]): LatLng {
  let totalArea = 0;
  let lat = 0;
  let lon = 0;
  for (const ring of rings) {
    const { area, centroid } = ringCentroid(ring);
    totalArea += area;
    lat += area * centroid.lat;
    lon += area * centroid.lon;
  }
  if (totalArea === 0) {
    // A Footprint with no area: fall back to the average of its points.
    const points = rings.flat();
    return {
      lat: points.reduce((sum, p) => sum + p.lat, 0) / points.length,
      lon: points.reduce((sum, p) => sum + p.lon, 0) / points.length,
    };
  }
  return { lat: lat / totalArea, lon: lon / totalArea };
}

/** A ring's unsigned area and centroid, by fanning it into triangles from its first point. */
function ringCentroid(ring: LatLng[]): { area: number; centroid: LatLng } {
  const origin = ring[0]!;
  let signedArea = 0;
  // Sums of each triangle's centroid offset, weighted by its signed area.
  let weightedX = 0;
  let weightedY = 0;
  for (let i = 1; i < ring.length - 1; i++) {
    // Offsets from the origin keep the numbers small.
    const ax = ring[i]!.lon - origin.lon;
    const ay = ring[i]!.lat - origin.lat;
    const bx = ring[i + 1]!.lon - origin.lon;
    const by = ring[i + 1]!.lat - origin.lat;
    const triangle = (ax * by - bx * ay) / 2;
    signedArea += triangle;
    weightedX += (triangle * (ax + bx)) / 3;
    weightedY += (triangle * (ay + by)) / 3;
  }
  if (signedArea === 0) return { area: 0, centroid: origin };
  return {
    area: Math.abs(signedArea),
    centroid: { lat: origin.lat + weightedY / signedArea, lon: origin.lon + weightedX / signedArea },
  };
}

/** Joins way segments that share end points into rings; OSM often splits a multipolygon's outline over several ways. */
function joinIntoRings(segments: LatLng[][]): LatLng[][] {
  const remaining = segments.filter((s) => s.length > 0).map((s) => [...s]);
  const rings: LatLng[][] = [];

  while (remaining.length > 0) {
    const ring = remaining.shift()!;
    let extended = true;
    while (!isClosed(ring) && extended) {
      extended = false;
      const end = ring[ring.length - 1]!;
      const nextIndex = remaining.findIndex((s) => samePoint(s[0]!, end) || samePoint(s[s.length - 1]!, end));
      if (nextIndex >= 0) {
        const [next] = remaining.splice(nextIndex, 1);
        const oriented = samePoint(next![0]!, end) ? next! : [...next!].reverse();
        ring.push(...oriented.slice(1));
        extended = true;
      }
    }
    rings.push(ring);
  }
  return rings;
}

function withoutClosingPoint(ring: LatLng[]): LatLng[] {
  return isClosed(ring) ? ring.slice(0, -1) : ring;
}

function isClosed(ring: LatLng[]): boolean {
  return ring.length > 1 && samePoint(ring[0]!, ring[ring.length - 1]!);
}

function samePoint(a: LatLng, b: LatLng): boolean {
  return a.lat === b.lat && a.lon === b.lon;
}
