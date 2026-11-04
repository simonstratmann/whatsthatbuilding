import { describe, expect, it } from "vitest";
import type { IdentificationWarning } from "@whatisthatbuilding/shared";
import { noticesFor } from "./identification-notices.ts";

describe("noticesFor", () => {
  it("has nothing to say about a Snapshot with no warnings", () => {
    expect(noticesFor([])).toEqual([]);
  });

  it("says each warning in words, in the order given", () => {
    const warnings: IdentificationWarning[] = ["imprecise-location", "compass-uncalibrated", "nothing-found"];

    const notices = noticesFor(warnings);

    expect(notices).toHaveLength(3);
    expect(notices[0]).toMatch(/position is imprecise/i);
    expect(notices[1]).toMatch(/figure-8/);
    expect(notices[2]).toMatch(/no buildings found/i);
  });

  it("says there is no building data outside the Coverage Area", () => {
    expect(noticesFor(["outside-coverage-area"])).toEqual(["No building data here."]);
  });
});
