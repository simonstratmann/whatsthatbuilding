import { describe, expect, it } from "vitest";
import { cameraHeading } from "./sensors.ts";

// Readings follow the DeviceOrientation spec: alpha turns the phone anticlockwise seen from above,
// beta tilts its top edge up, gamma tilts its right edge down. Flat on its back with its top edge
// to the north, all three are 0.

describe("cameraHeading", () => {
  it.each([
    { pose: "held upright, top edge north", alpha: 0, expected: 0 },
    // Turning anticlockwise by 90° points the rear camera west.
    { pose: "held upright, turned to the west", alpha: 90, expected: 270 },
    { pose: "held upright, turned to the east", alpha: 270, expected: 90 },
    { pose: "held upright, turned to the south", alpha: 180, expected: 180 },
  ])("gives the rear camera's heading from north when $pose", ({ alpha, expected }) => {
    expect(cameraHeading({ alpha, beta: 90, gamma: 0 })).toBeCloseTo(expected, 6);
  });

  it.each([
    { pose: "tilted back to aim up at a tower", beta: 130 },
    { pose: "tilted forward to aim down a hill", beta: 50 },
  ])("keeps the heading when the phone is $pose", ({ beta }) => {
    expect(cameraHeading({ alpha: 270, beta, gamma: 0 })).toBeCloseTo(90, 6);
  });

  it("gives the rear camera's heading in landscape, whichever way the screen is turned", () => {
    // Right edge up, screen facing west: the rear camera faces east.
    expect(cameraHeading({ alpha: 0, beta: 0, gamma: -90 })).toBeCloseTo(90, 6);
    // Left edge up, screen facing east: the rear camera faces west.
    expect(cameraHeading({ alpha: 0, beta: 0, gamma: 90 })).toBeCloseTo(270, 6);
  });

  it("returns a heading in [0, 360) when facing just west of north", () => {
    const heading = cameraHeading({ alpha: 5, beta: 90, gamma: 0 });

    expect(heading).toBeCloseTo(355, 6);
  });

  it("gives no heading when the phone lies flat, since the camera points at the ground", () => {
    expect(cameraHeading({ alpha: 0, beta: 0, gamma: 0 })).toBeNull();
    expect(cameraHeading({ alpha: 0, beta: 5, gamma: 5 })).toBeNull();
  });

  it("gives no heading when the platform has no absolute orientation", () => {
    expect(cameraHeading({ alpha: null, beta: null, gamma: null })).toBeNull();
  });
});
