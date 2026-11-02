import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import type { RequestRecord } from "../src/request-log";
import { writeRequestLog } from "./request-log";

const record: RequestRecord = {
  id: "20261102-153012-k3f9",
  startedAt: "2026-11-02T14:30:12.000Z",
  mode: "phone",
  snapshot: { position: { lat: 52.3745, lon: 9.7386 }, heading: 87.4, accuracyMetres: 8 },
  orientation: { alpha: 272.6, beta: 88, gamma: 1 },
  overpass: [
    {
      url: "https://overpass.example.org/api/interpreter",
      query: "[out:json];way;out geom;",
      status: 200,
      durationMs: 412,
      response: { elements: [] },
    },
  ],
  candidates: [
    {
      number: 1,
      footprintId: "way/1001",
      label: "Opernhaus",
      distanceMetres: 24.4,
      location: { lat: 52.3747, lon: 9.7399 },
      geoUri: "geo:52.3747,9.7399?q=52.3747,9.7399(Opernhaus)",
    },
  ],
  durationMs: 431,
};

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "request-log-"));
});

describe("writeRequestLog", () => {
  it("keeps the whole request as JSON under its ID and adds a line to the log", async () => {
    await writeRequestLog(dir, { kind: "request", record });

    const saved = JSON.parse(await readFile(join(dir, "requests", "20261102-153012-k3f9.json"), "utf8"));
    expect(saved).toEqual(record);
    const log = await readFile(join(dir, "requests.log"), "utf8");
    expect(log).toBe(
      "2026-11-02T14:30:12.000Z 20261102-153012-k3f9 phone 52.3745,9.7386 ±8 m heading 87° " +
        "overpass 200 in 412 ms → 1 Candidate: 1 Opernhaus (way/1001) 24 m\n",
    );
  });

  it("logs a failed request with its error", async () => {
    const failed: RequestRecord = {
      ...record,
      id: "20261102-153100-zz01",
      overpass: [{ ...record.overpass[0]!, status: 502, response: "<html>Bad Gateway</html>" }],
      candidates: undefined,
      error: "Overpass request failed: 502",
    };

    await writeRequestLog(dir, { kind: "request", record: failed });

    const log = await readFile(join(dir, "requests.log"), "utf8");
    expect(log).toBe(
      "2026-11-02T14:30:12.000Z 20261102-153100-zz01 phone 52.3745,9.7386 ±8 m heading 87° " +
        "overpass 502 in 412 ms → failed: Overpass request failed: 502\n",
    );
  });

  it("adds the user's choice to the request it belongs to", async () => {
    await writeRequestLog(dir, { kind: "request", record });

    const choice = { number: 1, footprintId: "way/1001", at: "2026-11-02T14:30:20.000Z" };
    await writeRequestLog(dir, { kind: "choice", id: record.id, choice });

    const saved = JSON.parse(await readFile(join(dir, "requests", `${record.id}.json`), "utf8"));
    expect(saved.chosen).toEqual(choice);
    const lines = (await readFile(join(dir, "requests.log"), "utf8")).trimEnd().split("\n");
    expect(lines.at(-1)).toBe("2026-11-02T14:30:20.000Z 20261102-153012-k3f9 chose 1 (way/1001)");
  });

  it("refuses an ID that could reach outside the log folder", async () => {
    await expect(
      writeRequestLog(dir, { kind: "request", record: { ...record, id: "../escape" } }),
    ).rejects.toThrow(/request ID/);

    expect(await readdir(dir)).toEqual([]);
  });
});
