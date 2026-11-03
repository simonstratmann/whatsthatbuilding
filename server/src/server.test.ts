import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChoiceReport, Footprint, IdentifyRequest, IdentifyResponse, LatLng } from "@whatisthatbuilding/shared";
import type { FootprintSource } from "./identification.ts";
import { startServer, type RunningServer } from "./server.ts";
import { offsetFrom } from "./test-geo.ts";

const ORIGIN: LatLng = { lat: 52.3745, lon: 9.7386 };

/** A 20 m square building `north` metres north of ORIGIN. */
function buildingNorth(id: string, north: number, tags: Pick<Footprint, "name" | "address"> = {}): Footprint {
  const at = (east: number, northOfUser: number) => offsetFrom(ORIGIN, east, northOfUser);
  return {
    id,
    rings: [[at(-10, north), at(10, north), at(10, north + 20), at(-10, north + 20)]],
    centre: at(0, north + 10),
    ...tags,
  };
}

const facingNorth: IdentifyRequest = {
  snapshot: { position: ORIGIN, heading: 0, accuracyMetres: 5 },
  mode: "dev",
};

let server: RunningServer | undefined;
afterEach(async () => {
  await server?.close();
  server = undefined;
  vi.restoreAllMocks();
});

async function start(source: FootprintSource, requestLogDir?: string): Promise<string> {
  server = await startServer({ port: 0, footprintSource: () => source, ...(requestLogDir ? { requestLogDir } : {}) });
  return server.url;
}

function post(url: string, body: unknown): Promise<Response> {
  return fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

describe("POST /api/identify", () => {
  it("answers a Snapshot with its Candidates, Sight Cone and Line of Sight", async () => {
    const url = await start({ footprintsAround: async () => [buildingNorth("opera", 50, { name: "Opernhaus" })] });

    const response = await post(`${url}/api/identify`, facingNorth);

    expect(response.status).toBe(200);
    const body = (await response.json()) as IdentifyResponse;
    expect(body.requestId).toMatch(/^\d{8}-\d{6}-[a-z0-9]{4}$/);
    if (!("identification" in body)) throw new Error(`expected an identification, got ${JSON.stringify(body)}`);
    expect(body.identification.candidates).toMatchObject([
      { number: 1, footprint: { id: "opera" }, location: { label: "Opernhaus" } },
    ]);
    expect(body.identification.candidates[0]?.distanceMetres).toBeCloseTo(50, 0);
    expect(body.identification.sightCone[0]).toEqual(ORIGIN);
    expect(body.identification.lineOfSight.from).toEqual(ORIGIN);
  });

  it("logs a failing Footprint source and answers with the error", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const url = await start({
      footprintsAround: async () => {
        throw new Error("Overpass request failed: 504");
      },
    });

    const response = await post(`${url}/api/identify`, facingNorth);

    expect(response.status).toBe(502);
    const body = (await response.json()) as IdentifyResponse;
    expect(body).toMatchObject({ error: "Error: Overpass request failed: 504" });
    expect(logged).toHaveBeenCalledWith(expect.stringContaining(body.requestId), expect.any(Error));
  });

  it("refuses a request that isn't a Snapshot", async () => {
    const url = await start({ footprintsAround: async () => [] });

    const response = await post(`${url}/api/identify`, { snapshot: { position: "here" } });

    expect(response.status).toBe(400);
  });

  it("keeps each request and the choice made from it in the request log", async () => {
    const dir = await mkdtemp(join(tmpdir(), "server-request-log-"));
    const url = await start({ footprintsAround: async () => [buildingNorth("opera", 50, { name: "Opernhaus" })] }, dir);

    const { requestId } = (await (await post(`${url}/api/identify`, facingNorth)).json()) as IdentifyResponse;
    const report: ChoiceReport = { requestId, choice: { number: 1, footprintId: "opera", at: "2026-11-03T18:00:00.000Z" } };
    const choice = await post(`${url}/api/choice`, report);

    expect(choice.status).toBe(204);
    const saved = JSON.parse(await readFile(join(dir, "requests", `${requestId}.json`), "utf8"));
    expect(saved).toMatchObject({
      id: requestId,
      mode: "dev",
      snapshot: facingNorth.snapshot,
      candidates: [{ number: 1, footprintId: "opera", label: "Opernhaus" }],
      chosen: report.choice,
    });
  });

  it("refuses a choice whose request ID could name a path outside the log folder", async () => {
    const url = await start({ footprintsAround: async () => [] });
    const choice = { number: 1, footprintId: "opera", at: "2026-11-03T18:00:00.000Z" };

    expect((await post(`${url}/api/choice`, { requestId: "../../etc/passwd", choice })).status).toBe(400);
    expect((await post(`${url}/api/choice`, { requestId: "20261103-180000-abcd", choice: { number: "1" } })).status).toBe(400);
  });
});

describe("the PWA", () => {
  async function startWithWebRoot(): Promise<string> {
    const webRoot = await mkdtemp(join(tmpdir(), "server-web-root-"));
    await mkdir(join(webRoot, "assets"));
    await writeFile(join(webRoot, "index.html"), "<!doctype html><title>app</title>");
    await writeFile(join(webRoot, "assets", "index-abc123.js"), "console.log('app')");
    server = await startServer({ port: 0, footprintSource: () => ({ footprintsAround: async () => [] }), webRoot });
    return server.url;
  }

  it("serves the app for any path outside /api, and its hashed assets for good", async () => {
    const url = await startWithWebRoot();

    expect(await (await fetch(`${url}/?dev`)).text()).toContain("<title>app</title>");
    const asset = await fetch(`${url}/assets/index-abc123.js`);
    expect(asset.status).toBe(200);
    expect(asset.headers.get("Cache-Control")).toContain("immutable");
  });

  it("answers a missing asset with 404, not the app, so no stale name gets cached as HTML", async () => {
    const url = await startWithWebRoot();

    const missing = await fetch(`${url}/assets/index-gone.js`);

    expect(missing.status).toBe(404);
    expect(missing.headers.get("Cache-Control")).toBeNull();
  });
});
