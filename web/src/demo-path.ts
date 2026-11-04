import type { Snapshot } from "@whatisthatbuilding/shared";

const NUMBER = String.raw`\s*(-?\d+(?:\.\d+)?)\s*`;
/** "52.37446,9.73862,200": latitude, longitude and heading, with an optional @ and degree sign. */
const DEMO_SEGMENT = new RegExp(String.raw`^@?${NUMBER},${NUMBER},${NUMBER}°?$`);

/**
 * The Snapshot a demo link stands for: the last part of its path is latitude, longitude and
 * heading (degrees clockwise from north), e.g. `/52.37446,9.73862,200`. One part only, so the
 * app's relative asset paths still work. Taken as a perfect GPS fix and a calibrated compass.
 * Undefined for any other path.
 */
export function demoSnapshotFromPath(pathname: string): Snapshot | undefined {
  let segment: string;
  try {
    segment = decodeURIComponent(pathname.replace(/\/+$/, "").split("/").at(-1) ?? "");
  } catch {
    return undefined;
  }
  const match = DEMO_SEGMENT.exec(segment);
  if (!match) return undefined;
  const [lat, lon, heading] = match.slice(1).map(Number) as [number, number, number];
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return undefined;
  return {
    position: { lat, lon },
    heading: ((heading % 360) + 360) % 360,
    accuracyMetres: 0,
    compassCalibration: "calibrated",
  };
}
