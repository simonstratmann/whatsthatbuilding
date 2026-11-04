import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChoiceReport, Footprint, IdentifyRequest, IdentifyResponse, LatLng } from "@whatisthatbuilding/shared";
import type { DopProxy } from "./dop-proxy.ts";
import type { FootprintSource, LabelSource } from "./identification.ts";
import { startServer, type RunningServer } from "./server.ts";
import { offsetFrom } from "./test-geo.ts";

const ORIGIN: LatLng = { lat: 53.5503, lon: 9.9925 };

/** A 20 m square building `north` metres north of ORIGIN. */
function buildingNorth(id: string, north: number, tags: Pick<Footprint, "address"> = {}): Footprint {
  const at = (east: number, northOfUser: number) => offsetFrom(ORIGIN, east, northOfUser);
  return {
    id,
    rings: [[at(-10, north), at(10, north), at(10, north + 20), at(-10, north + 20)]],
    centre: at(0, north + 10),
    ...tags,
  };
}

const facingNorth: IdentifyRequest = {
  snapshot: { position: ORIGIN, heading: 0, accuracyMetres: 5, compassCalibration: "calibrated" },
  mode: "dev",
};

const TOWN_HALL = buildingNorth("town-hall", 50, { address: { street: "Rathausmarkt", houseNumber: "1" } });

/** A Footprint source covering everywhere, with these Footprints. */
function sourceOf(...footprints: Footprint[]): FootprintSource {
  return { covers: async () => true, footprintsAround: async () => footprints };
}

let server: RunningServer | undefined;
afterEach(async () => {
  await server?.close();
  server = undefined;
  vi.restoreAllMocks();
});

async function start(
  source: FootprintSource,
  requestLogDir?: string,
  options: { labelSource?: LabelSource } = {},
): Promise<string> {
  server = await startServer({ port: 0, footprintSource: source, ...(requestLogDir ? { requestLogDir } : {}), ...options });
  return server.url;
}

function post(url: string, body: unknown): Promise<Response> {
  return fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

describe("POST /api/identify", () => {
  it("answers a Snapshot with its Candidates, warnings, Sight Cone and Line of Sight", async () => {
    const url = await start(sourceOf(TOWN_HALL));

    const response = await post(`${url}/api/identify`, facingNorth);

    expect(response.status).toBe(200);
    const body = (await response.json()) as IdentifyResponse;
    expect(body.requestId).toMatch(/^\d{8}-\d{6}-[a-z0-9]{4}$/);
    if (!("identification" in body)) throw new Error(`expected an identification, got ${JSON.stringify(body)}`);
    expect(body.identification.candidates).toMatchObject([
      { number: 1, footprint: { id: "town-hall" }, location: { label: "Rathausmarkt 1" } },
    ]);
    expect(body.identification.warnings).toEqual([]);
    expect(body.identification.candidates[0]?.distanceMetres).toBeCloseTo(50, 0);
    expect(body.identification.sightCone[0]).toEqual(ORIGIN);
    expect(body.identification.lineOfSight.from).toEqual(ORIGIN);
  });

  it("answers a Snapshot outside the Coverage Area with its warning and no Candidates", async () => {
    const url = await start({ covers: async () => false, footprintsAround: async () => [TOWN_HALL] });

    const body = (await (await post(`${url}/api/identify`, facingNorth)).json()) as IdentifyResponse;

    expect(body).toMatchObject({ identification: { candidates: [], warnings: ["outside-coverage-area"] } });
  });

  it("logs a failing Footprint source and answers with the error", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const url = await start({
      covers: async () => true,
      footprintsAround: async () => {
        throw new Error("connect ECONNREFUSED 127.0.0.1:5432");
      },
    });

    const response = await post(`${url}/api/identify`, facingNorth);

    expect(response.status).toBe(502);
    const body = (await response.json()) as IdentifyResponse;
    expect(body).toMatchObject({ error: "Error: connect ECONNREFUSED 127.0.0.1:5432" });
    expect(logged).toHaveBeenCalledWith(expect.stringContaining(body.requestId), expect.any(Error));
  });

  it("labels Candidates by the names the Label source knows", async () => {
    const url = await start(sourceOf(TOWN_HALL), undefined, {
      labelSource: {
        namesAround: async () => ({ nameOf: (footprint) => (footprint.id === "town-hall" ? "Hamburger Rathaus" : undefined) }),
      },
    });

    const body = (await (await post(`${url}/api/identify`, facingNorth)).json()) as IdentifyResponse;

    expect(body).toMatchObject({ identification: { candidates: [{ location: { label: "Hamburger Rathaus" } }] } });
  });

  it("logs a failing Label source and answers with address Labels", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const url = await start(sourceOf(TOWN_HALL), undefined, {
      labelSource: {
        namesAround: async () => {
          throw new Error("Overpass request failed: 504");
        },
      },
    });

    const response = await post(`${url}/api/identify`, facingNorth);

    expect(response.status).toBe(200);
    const body = (await response.json()) as IdentifyResponse;
    expect(body).toMatchObject({ identification: { candidates: [{ location: { label: "Rathausmarkt 1" } }] } });
    expect(logged).toHaveBeenCalledWith(expect.stringContaining(body.requestId), expect.objectContaining({ message: "Overpass request failed: 504" }));
  });

  it("refuses a request that isn't a Snapshot", async () => {
    const url = await start(sourceOf());

    const response = await post(`${url}/api/identify`, { snapshot: { position: "here" } });
    const badCalibration = await post(`${url}/api/identify`, {
      ...facingNorth,
      snapshot: { ...facingNorth.snapshot, compassCalibration: "great" },
    });

    expect(response.status).toBe(400);
    expect(badCalibration.status).toBe(400);
  });

  it("takes a Snapshot from an older page without a compass-calibration state as unknown", async () => {
    const dir = await mkdtemp(join(tmpdir(), "server-request-log-"));
    const url = await start(sourceOf(), dir);
    const { compassCalibration: _, ...olderSnapshot } = facingNorth.snapshot;

    const response = await post(`${url}/api/identify`, { ...facingNorth, snapshot: olderSnapshot });

    expect(response.status).toBe(200);
    const { requestId } = (await response.json()) as IdentifyResponse;
    const saved = JSON.parse(await readFile(join(dir, "requests", `${requestId}.json`), "utf8"));
    expect(saved.snapshot.compassCalibration).toBe("unknown");
  });

  it("keeps each request and the choice made from it in the request log", async () => {
    const dir = await mkdtemp(join(tmpdir(), "server-request-log-"));
    const url = await start(sourceOf(TOWN_HALL), dir);

    const { requestId } = (await (await post(`${url}/api/identify`, facingNorth)).json()) as IdentifyResponse;
    const report: ChoiceReport = { requestId, choice: { number: 1, footprintId: "town-hall", at: "2026-11-03T18:00:00.000Z" } };
    const choice = await post(`${url}/api/choice`, report);

    expect(choice.status).toBe(204);
    const saved = JSON.parse(await readFile(join(dir, "requests", `${requestId}.json`), "utf8"));
    expect(saved).toMatchObject({
      id: requestId,
      mode: "dev",
      snapshot: facingNorth.snapshot,
      covered: true,
      footprints: [TOWN_HALL],
      candidates: [{ number: 1, footprintId: "town-hall", label: "Rathausmarkt 1" }],
      chosen: report.choice,
    });
  });

  it("refuses a choice whose request ID could name a path outside the log folder", async () => {
    const url = await start(sourceOf());
    const choice = { number: 1, footprintId: "town-hall", at: "2026-11-03T18:00:00.000Z" };

    expect((await post(`${url}/api/choice`, { requestId: "../../etc/passwd", choice })).status).toBe(400);
    expect((await post(`${url}/api/choice`, { requestId: "20261103-180000-abcd", choice: { number: "1" } })).status).toBe(400);
  });
});

describe("GET /api/dop/{z}/{x}/{y}", () => {
  const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);

  async function startWithDop(dop: DopProxy): Promise<string> {
    server = await startServer({ port: 0, footprintSource: sourceOf(), dop });
    return server.url;
  }

  it("serves the Aerial Photo tile as a JPEG the browser may keep", async () => {
    const tile = vi.fn<DopProxy["tile"]>(async () => ({ bytes: JPEG, contentType: "image/jpeg" }));
    const url = await startWithDop({ tile });

    const response = await fetch(`${url}/api/dop/17/69081/43072`);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/jpeg");
    expect(response.headers.get("Cache-Control")).toContain("max-age");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(JPEG);
    expect(tile).toHaveBeenCalledWith({ z: 17, x: 69081, y: 43072 });
  });

  it("answers 502 when the imagery service gives no tile", async () => {
    const url = await startWithDop({ tile: async () => Promise.reject(new Error("LGLN answered 503")) });

    const response = await fetch(`${url}/api/dop/17/69081/43072`);

    expect(response.status).toBe(502);
    expect(response.headers.get("Cache-Control")).toBeNull();
  });

  it("refuses a tile that doesn't exist", async () => {
    const tile = vi.fn<DopProxy["tile"]>();
    const url = await startWithDop({ tile });

    for (const path of ["17/69081/x", "17/-1/0", "2/4/0", "17/1.5/2", "30/0/0"]) {
      expect((await fetch(`${url}/api/dop/${path}`)).status, path).toBe(404);
    }
    expect(tile).not.toHaveBeenCalled();
  });
});

describe("the PWA", () => {
  async function startWithWebRoot(): Promise<string> {
    const webRoot = await mkdtemp(join(tmpdir(), "server-web-root-"));
    await mkdir(join(webRoot, "assets"));
    await writeFile(join(webRoot, "index.html"), "<!doctype html><title>app</title>");
    await writeFile(join(webRoot, "assets", "index-abc123.js"), "console.log('app')");
    await writeFile(join(webRoot, "manifest.webmanifest"), JSON.stringify({ display: "standalone" }));
    await writeFile(join(webRoot, "sw.js"), "self.addEventListener('fetch', () => {})");
    server = await startServer({ port: 0, footprintSource: sourceOf(), webRoot });
    return server.url;
  }

  it("serves the app for any path outside /api, and its hashed assets for good", async () => {
    const url = await startWithWebRoot();

    expect(await (await fetch(`${url}/?dev`)).text()).toContain("<title>app</title>");
    const asset = await fetch(`${url}/assets/index-abc123.js`);
    expect(asset.status).toBe(200);
    expect(asset.headers.get("Cache-Control")).toContain("immutable");
  });

  it("serves the manifest and the service worker as themselves, the worker always revalidated", async () => {
    const url = await startWithWebRoot();

    const manifest = await fetch(`${url}/manifest.webmanifest`);
    expect(manifest.headers.get("Content-Type")).toContain("application/manifest+json");
    expect(await manifest.json()).toMatchObject({ display: "standalone" });

    const worker = await fetch(`${url}/sw.js`);
    expect(worker.headers.get("Content-Type")).toContain("javascript");
    expect(worker.headers.get("Cache-Control")).toBe("no-cache");
    expect(await worker.text()).toContain("self.addEventListener");
  });

  it("answers a missing asset with 404, not the app, so no stale name gets cached as HTML", async () => {
    const url = await startWithWebRoot();

    const missing = await fetch(`${url}/assets/index-gone.js`);

    expect(missing.status).toBe(404);
    expect(missing.headers.get("Cache-Control")).toBeNull();
  });
});
