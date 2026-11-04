import { describe, expect, it } from "vitest";
import { demoSnapshotFromPath } from "./demo-path.ts";

describe("demoSnapshotFromPath", () => {
  it("reads the position and heading from the last part of the path", () => {
    expect(demoSnapshotFromPath("/52.37446,9.73862,200")).toEqual({
      position: { lat: 52.37446, lon: 9.73862 },
      heading: 200,
      accuracyMetres: 0,
      compassCalibration: "calibrated",
    });
  });

  it("reads it under a folder the app is served from, with or without a trailing slash", () => {
    expect(demoSnapshotFromPath("/building/53.5503,9.9925,0/")?.position).toEqual({ lat: 53.5503, lon: 9.9925 });
  });

  it("takes an @ in front, spaces after the commas and a degree sign, as people type them", () => {
    expect(demoSnapshotFromPath("/@53.5503,%209.9925,%20185.5%C2%B0")).toMatchObject({
      position: { lat: 53.5503, lon: 9.9925 },
      heading: 185.5,
    });
  });

  it("reads how far up the phone was tilted, when a fourth number gives it", () => {
    expect(demoSnapshotFromPath("/53.24918,10.412875,180,25")).toMatchObject({ heading: 180, pitch: 25 });
    expect(demoSnapshotFromPath("/53.24918,10.412875,180,-5°")?.pitch).toBe(-5);
    expect(demoSnapshotFromPath("/53.24918,10.412875,180")).not.toHaveProperty("pitch");
  });

  it("turns a heading outside 0–360° into one inside", () => {
    expect(demoSnapshotFromPath("/53.5,10,-90")?.heading).toBe(270);
    expect(demoSnapshotFromPath("/53.5,10,360")?.heading).toBe(0);
  });

  it("is no demo for the app's own paths, or for positions that can't be", () => {
    for (const path of ["/", "/index.html", "/?dev", "/53.5,10", "/53.5,10,200,4,5", "/53.5,10,200,95", "/95,10,0", "/53.5,190,0", "/a,b,c"]) {
      expect(demoSnapshotFromPath(path)).toBeUndefined();
    }
  });
});
