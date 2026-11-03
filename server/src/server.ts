import type { AddressInfo } from "node:net";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import {
  CHOICE_PATH,
  IDENTIFY_PATH,
  type ChoiceReport,
  type IdentifyRequest,
  type IdentifyResponse,
} from "@whatisthatbuilding/shared";
import { Hono } from "hono";
import { identify, type FootprintSource } from "./identification.ts";
import { newRequestId, recordingFetch, writeRequestLog, type RequestRecord } from "./request-log.ts";

export interface AppOptions {
  /**
   * The Footprint source for one request, given the fetch it must use for its outgoing
   * requests so the request log can keep them.
   */
  footprintSource(fetchFn: typeof fetch): FootprintSource;
  /** Where the request log goes (see writeRequestLog); without it nothing is written to disk. */
  requestLogDir?: string;
  /** The built PWA, served for every path outside /api; without it only the API is served. */
  webRoot?: string;
}

/** The API and, given a webRoot, the PWA. */
export function createApp({ footprintSource, requestLogDir, webRoot }: AppOptions): Hono {
  const app = new Hono();

  app.post(IDENTIFY_PATH, async (c) => {
    const request = asIdentifyRequest(await c.req.json().catch(() => undefined));
    if (!request) return c.json({ error: "Expected a Snapshot" }, 400);

    const requestId = newRequestId();
    const startedAt = new Date();
    const recorder = recordingFetch();
    const record: RequestRecord = {
      id: requestId,
      startedAt: startedAt.toISOString(),
      mode: request.mode,
      snapshot: request.snapshot,
      ...(request.orientation ? { orientation: request.orientation } : {}),
      overpass: recorder.exchanges,
      durationMs: 0,
    };

    let response: IdentifyResponse;
    try {
      const identification = await identify(request.snapshot, footprintSource(recorder.fetch));
      record.candidates = identification.candidates.map((candidate) => ({
        number: candidate.number,
        footprintId: candidate.footprint.id,
        ...(candidate.location.label ? { label: candidate.location.label } : {}),
        distanceMetres: candidate.distanceMetres,
        location: candidate.location.position,
        geoUri: candidate.location.geoUri,
      }));
      response = { requestId, identification };
    } catch (error) {
      console.error(`[identify] request ${requestId} failed:`, error);
      record.error = String(error);
      response = { requestId, error: record.error };
    }
    record.durationMs = Date.now() - startedAt.getTime();
    if (requestLogDir) await logSafely(writeRequestLog(requestLogDir, { kind: "request", record }));
    return c.json(response, "error" in response ? 502 : 200);
  });

  app.post(CHOICE_PATH, async (c) => {
    // sendBeacon may send it as text/plain, so don't insist on a JSON content type.
    const report = (await c.req.text().then(JSON.parse).catch(() => undefined)) as ChoiceReport | undefined;
    if (!report?.requestId || !report.choice) return c.body(null, 400);
    if (requestLogDir) {
      await logSafely(writeRequestLog(requestLogDir, { kind: "choice", id: report.requestId, choice: report.choice }));
    }
    return c.body(null, 204);
  });

  app.all("/api/*", (c) => c.json({ error: "Not found" }, 404));

  if (webRoot) {
    // Hashed file names, so they can be cached for good.
    app.use("/assets/*", async (c, next) => {
      await next();
      if (c.res.ok) c.header("Cache-Control", "public, max-age=31536000, immutable");
    });
    app.use("*", serveStatic({ root: webRoot }));
    // A missing asset is a stale file name, not a page of the app: never answer it with index.html.
    app.all("/assets/*", (c) => c.body(null, 404));
    // Any other path is the app itself, which reads its mode from the query string.
    app.get("*", serveStatic({ root: webRoot, path: "index.html" }));
  }
  return app;
}

/** The request log is for testing; a full disk or bad ID must not cost the user their answer. */
async function logSafely(writing: Promise<void>): Promise<void> {
  try {
    await writing;
  } catch (error) {
    console.error("[request-log]", error);
  }
}

function asIdentifyRequest(body: unknown): IdentifyRequest | undefined {
  const request = body as Partial<IdentifyRequest> | undefined;
  const snapshot = request?.snapshot;
  const isNumber = (value: unknown) => typeof value === "number" && Number.isFinite(value);
  if (
    !snapshot ||
    !isNumber(snapshot.position?.lat) ||
    !isNumber(snapshot.position?.lon) ||
    !isNumber(snapshot.heading) ||
    !isNumber(snapshot.accuracyMetres) ||
    (request.mode !== "phone" && request.mode !== "dev")
  ) {
    return undefined;
  }
  return request as IdentifyRequest;
}

export interface RunningServer {
  /** e.g. http://localhost:8080 */
  url: string;
  close(): Promise<void>;
}

/** Serves createApp over HTTP; port 0 picks a free port. */
export function startServer({ port, hostname, ...options }: AppOptions & { port: number; hostname?: string }): Promise<RunningServer> {
  const app = createApp(options);
  return new Promise((resolve) => {
    const server = serve({ fetch: app.fetch, port, ...(hostname ? { hostname } : {}) }, (info: AddressInfo) => {
      resolve({
        url: `http://localhost:${info.port}`,
        close: () => new Promise((done, fail) => server.close((error) => (error ? fail(error) : done()))),
      });
    });
  });
}
