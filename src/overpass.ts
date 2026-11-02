import type { Footprint, FootprintSource, LatLng } from "./identification";

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

interface OverpassWay {
  type: "way";
  id: number;
  geometry?: LatLng[];
}

interface OverpassRelation {
  type: "relation";
  id: number;
  members?: { type: string; role: string; geometry?: LatLng[] }[];
}

type OverpassElement = OverpassWay | OverpassRelation;

/** Footprints from OpenStreetMap, fetched live from the public Overpass API. */
export function overpassFootprintSource(fetchFn: typeof fetch = fetch.bind(globalThis)): FootprintSource {
  return {
    async footprintsAround(centre, radiusMetres) {
      const around = `around:${Math.round(radiusMetres)},${centre.lat},${centre.lon}`;
      const query = `[out:json][timeout:25];
(
  way["building"](${around});
  relation["building"]["type"="multipolygon"](${around});
);
out geom;`;

      const response = await fetchFn(OVERPASS_URL, {
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
  return usable.length > 0 ? [{ id: `${element.type}/${element.id}`, rings: usable }] : [];
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
