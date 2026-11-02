import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { join } from "node:path";
import type { Plugin } from "vite";
import { REQUEST_LOG_PATH, type RequestLogMessage, type RequestRecord } from "../src/request-log";

/** Request IDs as the app makes them; anything else could name a path outside the log folder. */
const REQUEST_ID = /^[A-Za-z0-9-]{1,64}$/;

/**
 * Serves the app's request log from the dev and preview servers: each request is kept as
 * `<dir>/requests/<id>.json` and summed up in one line of `<dir>/requests.log`.
 * The deployed app is static files only, so there it has nowhere to send its log.
 */
export function requestLogPlugin(dir: string): Plugin {
  const handle = (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (req.url !== REQUEST_LOG_PATH || req.method !== "POST") return next();
    readBody(req)
      .then((body) => writeRequestLog(dir, JSON.parse(body) as RequestLogMessage))
      .then(() => {
        res.statusCode = 204;
        res.end();
      })
      .catch((error: unknown) => {
        console.error("[request-log]", error);
        res.statusCode = 400;
        res.end(String(error));
      });
  };
  return {
    name: "request-log",
    configureServer: (server) => void server.middlewares.use(handle),
    configurePreviewServer: (server) => void server.middlewares.use(handle),
  };
}

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

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}
