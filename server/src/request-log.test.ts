import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { writeRequestLog, type RequestRecord } from "./request-log.ts";

const record: RequestRecord = {
  id: "20261102-153012-k3f9",
  startedAt: "2026-11-02T14:30:12.000Z",
  mode: "phone",
  snapshot: {
    position: { lat: 53.5503, lon: 9.9925 },
    heading: 87.4,
    accuracyMetres: 8,
    compassCalibration: "unknown",
  },
  orientation: { alpha: 272.6, beta: 88, gamma: 1 },
  covered: true,
  footprints: [
    {
      id: "DEHHALKA10000Rat",
      rings: [[{ lat: 53.5505, lon: 9.9926 }, { lat: 53.5505, lon: 9.9928 }, { lat: 53.5507, lon: 9.9928 }]],
      centre: { lat: 53.5506, lon: 9.9927 },
      address: { street: "Rathausmarkt", houseNumber: "1", city: "Hamburg" },
    },
  ],
  candidates: [
    {
      number: 1,
      footprintId: "DEHHALKA10000Rat",
      label: "Rathausmarkt 1",
      distanceMetres: 24.4,
      position: { lat: 53.5506, lon: 9.9927 },
      geoUri: "geo:53.5506,9.9927?q=53.5506,9.9927(Rathausmarkt%201)",
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
      "2026-11-02T14:30:12.000Z 20261102-153012-k3f9 phone 53.5503,9.9925 ±8 m heading 87° " +
        "1 Footprint → 1 Candidate: 1 Rathausmarkt 1 (DEHHALKA10000Rat) 24 m\n",
    );
  });

  it("logs a failed request with its error", async () => {
    const failed: RequestRecord = {
      ...record,
      id: "20261102-153100-zz01",
      footprints: undefined,
      candidates: undefined,
      error: "Error: connect ECONNREFUSED 127.0.0.1:5432",
    };

    await writeRequestLog(dir, { kind: "request", record: failed });

    const log = await readFile(join(dir, "requests.log"), "utf8");
    expect(log).toBe(
      "2026-11-02T14:30:12.000Z 20261102-153100-zz01 phone 53.5503,9.9925 ±8 m heading 87° " +
        "→ failed: Error: connect ECONNREFUSED 127.0.0.1:5432\n",
    );
  });

  it("logs a Snapshot outside the Coverage Area with its warning", async () => {
    const outside: RequestRecord = {
      ...record,
      id: "20261102-153200-out1",
      covered: false,
      footprints: undefined,
      candidates: [],
      warnings: ["outside-coverage-area"],
    };

    await writeRequestLog(dir, { kind: "request", record: outside });

    const log = await readFile(join(dir, "requests.log"), "utf8");
    expect(log).toBe(
      "2026-11-02T14:30:12.000Z 20261102-153200-out1 phone 53.5503,9.9925 ±8 m heading 87° " +
        "outside the Coverage Area → 0 Candidates, warnings: outside-coverage-area\n",
    );
  });

  it("adds the user's choice to the request it belongs to", async () => {
    await writeRequestLog(dir, { kind: "request", record });

    const choice = { number: 1, footprintId: "DEHHALKA10000Rat", at: "2026-11-02T14:30:20.000Z" };
    await writeRequestLog(dir, { kind: "choice", id: record.id, choice });

    const saved = JSON.parse(await readFile(join(dir, "requests", `${record.id}.json`), "utf8"));
    expect(saved.chosen).toEqual(choice);
    const lines = (await readFile(join(dir, "requests.log"), "utf8")).trimEnd().split("\n");
    expect(lines.at(-1)).toBe("2026-11-02T14:30:20.000Z 20261102-153012-k3f9 chose 1 (DEHHALKA10000Rat)");
  });

  it("refuses an ID that could reach outside the log folder", async () => {
    await expect(
      writeRequestLog(dir, { kind: "request", record: { ...record, id: "../escape" } }),
    ).rejects.toThrow(/request ID/);

    expect(await readdir(dir)).toEqual([]);
  });
});
