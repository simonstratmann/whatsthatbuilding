import { describe, expect, it } from "vitest";
import { cameraHeading, cameraPitch } from "./sensors.ts";

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

describe("cameraPitch", () => {
  it.each([
    { pose: "held upright", beta: 90, gamma: 0, expected: 0 },
    { pose: "tilted back to aim up at a tower", beta: 130, gamma: 0, expected: 40 },
    { pose: "tilted forward to aim down a hill", beta: 70, gamma: 0, expected: -20 },
    { pose: "held in landscape, level", beta: 0, gamma: -90, expected: 0 },
    // Landscape, right edge up, its screen tipped 30° towards the sky: gamma −60.
    { pose: "held in landscape, aiming 30° down", beta: 0, gamma: -60, expected: -30 },
  ])("gives how far above the horizon the rear camera points when $pose", ({ beta, gamma, expected }) => {
    expect(cameraPitch({ alpha: 123, beta, gamma })).toBeCloseTo(expected, 6);
  });

  it("gives no pitch when the platform has no orientation", () => {
    expect(cameraPitch({ alpha: null, beta: null, gamma: null })).toBeNull();
  });
});
