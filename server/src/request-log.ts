import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  Choice,
  Footprint,
  IdentificationOutcome,
  IdentificationWarning,
  IdentifyRequest,
  LatLng,
  OrientationReading,
  Snapshot,
} from "@whatisthatbuilding/shared";
import type { FootprintSource } from "./identification.ts";

/**
 * Everything one Snapshot led to, kept so a misbehaving test on the phone can be told
 * apart later and replayed as a unit test: the Snapshot and what the Footprint source
 * answered are the inputs `identify` needs, the Candidates and warnings what it gave.
 */
export interface RequestRecord {
  id: string;
  startedAt: string;
  mode: IdentifyRequest["mode"];
  snapshot: Snapshot;
  /** The raw absolute-orientation reading the heading came from (phone only). */
  orientation?: OrientationReading;
  /** Whether the Footprint source covered the position; absent if it was never asked. */
  covered?: boolean;
  /** The Footprints the source gave for the Sight Cone's circle. */
  footprints?: Footprint[];
  candidates?: {
    number: number;
    footprintId: string;
    label?: string;
    distanceMetres: number;
    position: LatLng;
    geoUri: string;
  }[];
  warnings?: IdentificationWarning[];
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

export function isRequestId(value: unknown): value is string {
  return typeof value === "string" && REQUEST_ID.test(value);
}

/** Local date and time, then a random suffix: sorts by time and is short enough to read out. */
export function newRequestId(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const suffix = Math.random().toString(36).slice(2, 6).padEnd(4, "0");
  return `${date}-${time}-${suffix}`;
}

/**
 * The record of one request to `POST /api/identify` as it starts; recordingSource fills in
 * what the Footprint source answers, and finishRecord what came of it.
 */
export function startRecord(id: string, { snapshot, mode, orientation }: IdentifyRequest, startedAt = new Date()): RequestRecord {
  return {
    id,
    startedAt: startedAt.toISOString(),
    mode,
    snapshot,
    ...(orientation ? { orientation } : {}),
    durationMs: 0,
  };
}

/** The Footprint source, keeping what it answers in the record. */
export function recordingSource(source: FootprintSource, record: RequestRecord): FootprintSource {
  return {
    async covers(position) {
      record.covered = await source.covers(position);
      return record.covered;
    },
    async footprintsAround(centre, radiusMetres) {
      record.footprints = await source.footprintsAround(centre, radiusMetres);
      return record.footprints;
    },
    shellsOf: (ids) => source.shellsOf(ids),
  };
}

/** Adds the Candidates, or the error, and how long the request took. */
export function finishRecord(
  record: RequestRecord,
  outcome: IdentificationOutcome,
  finishedAt = new Date(),
): void {
  if ("error" in outcome) {
    record.error = outcome.error;
  } else {
    const { warnings } = outcome.identification;
    if (warnings.length > 0) record.warnings = warnings;
    record.candidates = outcome.identification.candidates.map(({ number, footprint, distanceMetres, location }) => ({
      number,
      footprintId: footprint.id,
      ...(location.label ? { label: location.label } : {}),
      distanceMetres,
      position: location.position,
      geoUri: location.geoUri,
    }));
  }
  record.durationMs = finishedAt.getTime() - Date.parse(record.startedAt);
}

/**
 * The server's request log: each request is kept as `<dir>/requests/<id>.json` and summed up
 * in one line of `<dir>/requests.log`.
 */
export async function writeRequestLog(dir: string, message: RequestLogMessage): Promise<void> {
  const id = message.kind === "request" ? message.record.id : message.id;
  if (!isRequestId(id)) throw new Error(`Not a request ID: ${JSON.stringify(id)}`);
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

function summary({ id, startedAt, mode, snapshot, covered, footprints, candidates, warnings, error }: RequestRecord): string {
  const { position, heading, accuracyMetres } = snapshot;
  const source =
    covered === false
      ? "outside the Coverage Area"
      : footprints
        ? `${footprints.length} Footprint${footprints.length === 1 ? "" : "s"}`
        : "";
  const listed = candidates?.length
    ? `: ${candidates.map((c) => `${c.number} ${c.label ?? "unnamed"} (${c.footprintId}) ${Math.round(c.distanceMetres)} m`).join(", ")}`
    : "";
  const outcome = error
    ? `failed: ${error}`
    : `${candidates?.length ?? 0} Candidate${candidates?.length === 1 ? "" : "s"}${listed}` +
      (warnings?.length ? `, warnings: ${warnings.join(", ")}` : "");
  return [
    startedAt,
    id,
    mode,
    `${position.lat},${position.lon}`,
    `±${Math.round(accuracyMetres)} m`,
    `heading ${Math.round(heading)}°`,
    source,
    `→ ${outcome}`,
  ]
    .filter(Boolean)
    .join(" ");
}
