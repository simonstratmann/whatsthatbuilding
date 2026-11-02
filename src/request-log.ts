import type { LatLng, Snapshot } from "./identification";
import type { OrientationReading } from "./sensors";

/** One Overpass call as it went over the wire. */
export interface OverpassExchange {
  url: string;
  /** The Overpass QL query sent. */
  query: string | null;
  /** HTTP status, or null when the request never got an answer. */
  status: number | null;
  durationMs: number;
  /** The parsed JSON answer, or its text when it wasn't JSON. */
  response: unknown;
  error?: string;
}

/**
 * Everything one Snapshot led to, kept so a misbehaving test on the phone can be told
 * apart later and replayed as a unit test: the Snapshot and Overpass answer are the inputs
 * `identify` needs, the Candidates what it gave.
 */
export interface RequestRecord {
  id: string;
  startedAt: string;
  mode: "phone" | "dev";
  snapshot: Snapshot;
  /** The raw absolute-orientation reading the heading came from (phone only). */
  orientation?: OrientationReading;
  overpass: OverpassExchange[];
  candidates?: {
    number: number;
    footprintId: string;
    label?: string;
    distanceMetres: number;
    location: LatLng;
    geoUri: string;
  }[];
  error?: string;
  durationMs: number;
  chosen?: Choice;
}

export interface Choice {
  number: number;
  footprintId: string;
  at: string;
}

/** What the browser sends to the dev server's request log. */
export type RequestLogMessage =
  | { kind: "request"; record: RequestRecord }
  | { kind: "choice"; id: string; choice: Choice };

/** Where the dev server accepts RequestLogMessages. */
export const REQUEST_LOG_PATH = "/__request-log";
