import { localProjection, ringContains, type Footprint, type LatLng, type Point } from "@whatisthatbuilding/shared";
import type { LabelSource, Names } from "./identification.ts";

type OsmTags = Partial<Record<string, string>>;

interface OverpassNode {
  type: "node";
  id: number;
  lat: number;
  lon: number;
  tags?: OsmTags;
}

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

type OverpassElement = OverpassNode | OverpassWay | OverpassRelation;

/** Used when OVERPASS_URL is unset or empty. */
export const PUBLIC_OVERPASS_URL = "https://overpass-api.de/api/interpreter";

/** Overpass servers turn away requests that don't say who sends them (the public one with a 406). */
const USER_AGENT = "whatisthatbuilding/0.1 (+https://github.com/simonstratmann/whatsthatbuilding)";

/** How long to wait for names before identifying without them; the self-hosted server answers in about 1 s. */
const TIMEOUT_MS = 5_000;

export interface OverpassOptions {
  /** The Overpass interpreter endpoint. */
  url: string;
  fetchFn?: typeof fetch;
}

/**
 * Names from OpenStreetMap, fetched live from an Overpass server: named buildings, and named
 * points (shops, cafés, …) that lie inside a building.
 */
export function overpassLabelSource({ url, fetchFn = fetch }: OverpassOptions): LabelSource {
  return {
    async namesAround(centre, radiusMetres) {
      const around = `around:${Math.round(radiusMetres)},${centre.lat},${centre.lon}`;
      const query = `[out:json][timeout:${TIMEOUT_MS / 1000}];
(
  way["building"]["name"](${around});
  relation["building"]["name"](${around});
  node["name"][!"place"][!"highway"][!"public_transport"][!"memorial"](${around});
);
out geom;`;

      const response = await fetchFn(url, {
        method: "POST",
        headers: { "User-Agent": USER_AGENT },
        body: new URLSearchParams({ data: query }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(`Overpass request failed: ${response.status}`);
      const { elements, remark } = (await response.json()) as { elements: OverpassElement[]; remark?: string };
      // A query that ran out of time or memory still answers 200, with what it found so far.
      if (remark) throw new Error(`Overpass query failed: ${remark}`);
      return namesFrom(elements, centre);
    },
  };
}

/** A named OSM building, its outline in metres around the centre the names were asked for. */
interface NamedOutline {
  name: string;
  rings: Point[][];
}

/** A named OSM point, in metres around the centre the names were asked for. */
interface NamedPoint {
  name: string;
  at: Point;
}

/**
 * A building's own name wins: a Footprint takes the name of the OSM building its centre lies
 * in. Failing that, it takes the name of a named point inside it. When several different names
 * qualify, as with the shops in a mall, none of them names the building.
 */
function namesFrom(elements: OverpassElement[], centre: LatLng): Names {
  const toLocal = localProjection(centre);
  const outlines: NamedOutline[] = [];
  const points: NamedPoint[] = [];
  for (const element of elements) {
    const name = element.tags?.name;
    if (!name) continue;
    if (element.type === "node") {
      points.push({ name, at: toLocal(element) });
    } else {
      const rings = outerRings(element).filter((ring) => ring.length >= 3);
      if (rings.length > 0) outlines.push({ name, rings: rings.map((ring) => ring.map(toLocal)) });
    }
  }

  return {
    nameOf(footprint: Footprint) {
      const centreOfFootprint = toLocal(footprint.centre);
      const own = outlines
        .filter(({ rings }) => rings.some((ring) => ringContains(ring, centreOfFootprint)))
        .map(({ name }) => name);
      if (own.length > 0) return onlyName(own);

      const rings = footprint.rings.map((ring) => ring.map(toLocal));
      return onlyName(points.filter(({ at }) => rings.some((ring) => ringContains(ring, at))).map(({ name }) => name));
    },
  };
}

function onlyName(names: string[]): string | undefined {
  const distinct = new Set(names);
  return distinct.size === 1 ? names[0] : undefined;
}

/** A building's outline: a way's own ring, or a multipolygon's outer rings, which OSM often splits over several ways. */
function outerRings(element: OverpassWay | OverpassRelation): LatLng[][] {
  if (element.type === "way") return [element.geometry ?? []];
  const outer = (element.members ?? [])
    .filter((member) => member.type === "way" && (member.role === "outer" || member.role === "outline"))
    .map((member) => member.geometry ?? []);
  return joinIntoRings(outer);
}

/** Joins way segments that share end points into rings. */
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

function isClosed(ring: LatLng[]): boolean {
  return ring.length > 1 && samePoint(ring[0]!, ring[ring.length - 1]!);
}

function samePoint(a: LatLng, b: LatLng): boolean {
  return a.lat === b.lat && a.lon === b.lon;
}
