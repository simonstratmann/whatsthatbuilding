import { describe, expect, it } from "vitest";
import type { Candidate } from "@whatisthatbuilding/shared";
import { candidateEntryText } from "./candidate-entry.ts";

function candidate({
  label,
  heightMetres,
  buildingType,
  distanceMetres = 180.4,
}: { label?: string; heightMetres?: number; buildingType?: string; distanceMetres?: number }): Candidate {
  const position = { lat: 53.55, lon: 10 };
  return {
    number: 3,
    footprint: { id: "b", rings: [], centre: position, ...(heightMetres === undefined ? {} : { heightMetres }) },
    distanceMetres,
    location: { position, geoUri: "geo:53.55,10", ...(label ? { label } : {}) },
    ...(buildingType ? { buildingType } : {}),
  };
}

describe("candidateEntryText", () => {
  it("gives the Label, height in whole metres, building type and distance", () => {
    expect(candidateEntryText(candidate({ label: "Lange Str. 12", heightMetres: 41.6, buildingType: "Wohnhaus" }))).toBe(
      "Lange Str. 12 · 42 m · Wohnhaus · 180 m",
    );
  });

  it("leaves out a missing height and building type", () => {
    expect(candidateEntryText(candidate({ label: "Lange Str. 12" }))).toBe("Lange Str. 12 · 180 m");
  });

  it("names an unlabelled building by its type", () => {
    expect(candidateEntryText(candidate({ heightMetres: 8.2, buildingType: "Garage", distanceMetres: 12 }))).toBe(
      "8 m · Garage · 12 m",
    );
  });

  it("calls a building with nothing known about it an unnamed building", () => {
    expect(candidateEntryText(candidate({}))).toBe("Unnamed building · 180 m");
  });
});
