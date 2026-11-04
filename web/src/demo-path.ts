import type { Snapshot } from "@whatisthatbuilding/shared";

const NUMBER = String.raw`\s*(-?\d+(?:\.\d+)?)\s*`;
/**
 * "52.37446,9.73862,200": latitude, longitude and heading, then optionally the pitch, with an
 * optional @ in front and degree sign after.
 */
const DEMO_SEGMENT = new RegExp(String.raw`^@?${NUMBER},${NUMBER},${NUMBER}°?(?:,${NUMBER}°?)?$`);

/**
 * The Snapshot a demo link stands for: the last part of its path is latitude, longitude and
 * heading (degrees clockwise from north), e.g. `/52.37446,9.73862,200`, and optionally how
 * far up the phone was tilted (degrees above the horizon), e.g. `/53.24918,10.412875,180,25`. One part only, so the
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
  const [lat, lon, heading, pitch] = match.slice(1).map((n) => (n === undefined ? undefined : Number(n))) as [
    number,
    number,
    number,
    number | undefined,
  ];
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180 || (pitch !== undefined && Math.abs(pitch) > 90)) return undefined;
  return {
    position: { lat, lon },
    heading: ((heading % 360) + 360) % 360,
    ...(pitch === undefined ? {} : { pitch }),
    accuracyMetres: 0,
    compassCalibration: "calibrated",
  };
}
