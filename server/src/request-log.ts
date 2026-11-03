import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Choice, IdentifyRequest, LatLng, OrientationReading, Snapshot } from "@whatisthatbuilding/shared";

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
  mode: IdentifyRequest["mode"];
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

/** What goes into the request log: a whole request, or the choice made from its Candidates later. */
export type RequestLogMessage =
  | { kind: "request"; record: RequestRecord }
  | { kind: "choice"; id: string; choice: Choice };

/** Request IDs as newRequestId makes them; anything else could name a path outside the log folder. */
const REQUEST_ID = /^[A-Za-z0-9-]{1,64}$/;

/** Local date and time, then a random suffix: sorts by time and is short enough to read out. */
export function newRequestId(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const suffix = Math.random().toString(36).slice(2, 6).padEnd(4, "0");
  return `${date}-${time}-${suffix}`;
}

/**
 * The server's request log: each request is kept as `<dir>/requests/<id>.json` and summed up
 * in one line of `<dir>/requests.log`.
 */
export async function writeRequestLog(dir: string, message: RequestLogMessage): Promise<void> {
  const id = message.kind === "request" ? message.record.id : message.id;
  if (!REQUEST_ID.test(id)) throw new Error(`Not a request ID: ${JSON.stringify(id)}`);
  const requests = join(dir, "requests");
  const file = join(requests, `${id}.json`);
  await mkdir(requests, { recursive: true });

  if (message.kind === "request") {
    await writeFile(file, JSON.stringify(message.record, null, 2));
    await appendFile(join(dir, "requests.log"), `${summary(message.record)}\n`);
  } else {
    const record = JSON.parse(await readFile(file, "utf8")) as RequestRecord;
    record.chosen = message.choice;
    await writeFile(file, JSON.stringify(record, null, 2));
    const { number, footprintId, at } = message.choice;
    await appendFile(join(dir, "requests.log"), `${at} ${id} chose ${number} (${footprintId})\n`);
  }
}

function summary({ id, startedAt, mode, snapshot, overpass, candidates, error }: RequestRecord): string {
  const { position, heading, accuracyMetres } = snapshot;
  const calls = overpass
    .map((call) => `overpass ${call.status ?? call.error ?? "no answer"} in ${Math.round(call.durationMs)} ms`)
    .join(", ");
  const outcome = error
    ? `failed: ${error}`
    : `${candidates?.length ?? 0} Candidate${candidates?.length === 1 ? "" : "s"}: ` +
      (candidates ?? [])
        .map((c) => `${c.number} ${c.label ?? "unnamed"} (${c.footprintId}) ${Math.round(c.distanceMetres)} m`)
        .join(", ");
  return [
    startedAt,
    id,
    mode,
    `${position.lat},${position.lon}`,
    `±${Math.round(accuracyMetres)} m`,
    `heading ${Math.round(heading)}°`,
    calls,
    `→ ${outcome}`,
  ]
    .filter(Boolean)
    .join(" ");
}

/** A fetch that keeps a copy of each Overpass query and its answer, for the request log. */
export function recordingFetch(fetchFn: typeof fetch = fetch): { fetch: typeof fetch; exchanges: OverpassExchange[] } {
  const exchanges: OverpassExchange[] = [];
  const recording: typeof fetch = async (input, init) => {
    const started = performance.now();
    const query = init?.body instanceof URLSearchParams ? init.body.get("data") : null;
    const exchange: OverpassExchange = { url: String(input), query, status: null, durationMs: 0, response: null };
    exchanges.push(exchange);
    try {
      const response = await fetchFn(input, init);
      const text = await response.clone().text();
      exchange.status = response.status;
      exchange.response = parseIfJson(text);
      return response;
    } catch (error) {
      exchange.error = String(error);
      throw error;
    } finally {
      exchange.durationMs = Math.round(performance.now() - started);
    }
  };
  return { fetch: recording, exchanges };
}

function parseIfJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
