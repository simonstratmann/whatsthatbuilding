import { identify, type Candidate, type Identification, type Snapshot } from "./identification";
import { overpassFootprintSource } from "./overpass";
import { REQUEST_LOG_PATH, type OverpassExchange, type RequestLogMessage, type RequestRecord } from "./request-log";
import type { OrientationReading } from "./sensors";

/**
 * Only the dev server and builds made with VITE_REQUEST_LOG=true (`preview:https`, the
 * dev-latest image) have the request log; a production build doesn't send each Overpass
 * answer to a server that would drop it.
 */
const LOGGING = import.meta.env.DEV || import.meta.env.VITE_REQUEST_LOG === "true";

export type LoggedIdentification =
  | { requestId: string; identification: Identification }
  | { requestId: string; error: unknown };

/**
 * Runs the identification for a Snapshot and sends the whole request (Snapshot, Overpass
 * traffic, Candidates or error) to the dev server's request log under a new request ID,
 * which the screen shows so a test can be looked up later.
 */
export async function identifyAndLog(
  snapshot: Snapshot,
  mode: RequestRecord["mode"],
  orientation?: OrientationReading,
): Promise<LoggedIdentification> {
  const requestId = newRequestId();
  const startedAt = new Date();
  const recorder = recordingFetch();
  const record: RequestRecord = {
    id: requestId,
    startedAt: startedAt.toISOString(),
    mode,
    snapshot,
    ...(orientation ? { orientation } : {}),
    overpass: recorder.exchanges,
    durationMs: 0,
  };

  let outcome: LoggedIdentification;
  try {
    const identification = await identify(snapshot, overpassFootprintSource({ fetchFn: recorder.fetch }));
    record.candidates = identification.candidates.map((candidate) => ({
      number: candidate.number,
      footprintId: candidate.footprint.id,
      ...(candidate.location.label ? { label: candidate.location.label } : {}),
      distanceMetres: candidate.distanceMetres,
      location: candidate.location.position,
      geoUri: candidate.location.geoUri,
    }));
    outcome = { requestId, identification };
  } catch (error) {
    record.error = String(error);
    outcome = { requestId, error };
  }
  record.durationMs = Date.now() - startedAt.getTime();
  void send({ kind: "request", record });
  return outcome;
}

/** Adds the chosen Candidate to its request's log entry. Survives the page handing off to the maps app. */
export function logChoice(requestId: string, candidate: Candidate): void {
  if (!LOGGING) return;
  const message: RequestLogMessage = {
    kind: "choice",
    id: requestId,
    choice: { number: candidate.number, footprintId: candidate.footprint.id, at: new Date().toISOString() },
  };
  navigator.sendBeacon(REQUEST_LOG_PATH, new Blob([JSON.stringify(message)], { type: "application/json" }));
}

/** Local date and time, then a random suffix: sorts by time and is short enough to read out. */
function newRequestId(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const suffix = Math.random().toString(36).slice(2, 6).padEnd(4, "0");
  return `${date}-${time}-${suffix}`;
}

/** A fetch that keeps a copy of each Overpass query and its answer. */
function recordingFetch(): { fetch: typeof fetch; exchanges: OverpassExchange[] } {
  const exchanges: OverpassExchange[] = [];
  const recording: typeof fetch = async (input, init) => {
    const started = performance.now();
    const query = init?.body instanceof URLSearchParams ? init.body.get("data") : null;
    const exchange: OverpassExchange = { url: String(input), query, status: null, durationMs: 0, response: null };
    exchanges.push(exchange);
    try {
      const response = await fetch(input, init);
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

/** Best effort: the deployed static app has no log to send to, and logging must never break a test. */
async function send(message: RequestLogMessage): Promise<void> {
  if (!LOGGING) return;
  try {
    await fetch(REQUEST_LOG_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message),
    });
  } catch {
    // Nothing to do: the request still worked, it just isn't logged.
  }
}
