import type { AddressInfo } from "node:net";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import {
  CHOICE_PATH,
  COMPASS_CALIBRATIONS,
  IDENTIFY_PATH,
  type ChoiceReport,
  type IdentifyRequest,
  type IdentifyResponse,
} from "@whatisthatbuilding/shared";
import { Hono } from "hono";
import { identify, type FootprintSource } from "./identification.ts";
import { finishRecord, isRequestId, newRequestId, recordingSource, startRecord, writeRequestLog } from "./request-log.ts";

export interface AppOptions {
  /** Where Footprints come from: the LoD2 store, or a fake in tests. */
  footprintSource: FootprintSource;
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
    const record = startRecord(requestId, request);

    let response: IdentifyResponse;
    try {
      response = { requestId, identification: await identify(request.snapshot, recordingSource(footprintSource, record)) };
    } catch (error) {
      console.error(`[identify] request ${requestId} failed:`, error);
      response = { requestId, error: String(error) };
    }
    finishRecord(record, response);
    if (requestLogDir) await logSafely(writeRequestLog(requestLogDir, { kind: "request", record }));
    return c.json(response, "error" in response ? 502 : 200);
  });

  app.post(CHOICE_PATH, async (c) => {
    // sendBeacon may send it as text/plain, so don't insist on a JSON content type.
    const report = asChoiceReport(await c.req.text().then(JSON.parse).catch(() => undefined));
    if (!report) return c.body(null, 400);
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
  // A page loaded before the calibration state existed doesn't send it.
  const compassCalibration = snapshot?.compassCalibration ?? "unknown";
  if (
    !snapshot ||
    !isNumber(snapshot.position?.lat) ||
    !isNumber(snapshot.position?.lon) ||
    !isNumber(snapshot.heading) ||
    !isNumber(snapshot.accuracyMetres) ||
    !COMPASS_CALIBRATIONS.includes(compassCalibration) ||
    (request.mode !== "phone" && request.mode !== "dev")
  ) {
    return undefined;
  }
  return { ...request, snapshot: { ...snapshot, compassCalibration } } as IdentifyRequest;
}

function asChoiceReport(body: unknown): ChoiceReport | undefined {
  const report = body as Partial<ChoiceReport> | undefined;
  const choice = report?.choice;
  if (
    !isRequestId(report?.requestId) ||
    !choice ||
    !Number.isInteger(choice.number) ||
    typeof choice.footprintId !== "string" ||
    typeof choice.at !== "string"
  ) {
    return undefined;
  }
  return report as ChoiceReport;
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
