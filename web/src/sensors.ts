import type { OrientationReading, Snapshot } from "@whatisthatbuilding/shared";

/**
 * Below this horizontal share of the camera's direction (about 78° from level), the phone
 * is too close to flat to say which way the camera faces.
 */
const MIN_HORIZONTAL_SHARE = 0.2;

/**
 * The heading the rear camera points along, in degrees clockwise from magnetic north (see Snapshot.heading), or null when the
 * phone lies too flat to tell or the reading is incomplete.
 *
 * The rear camera looks along the device's −z axis, which is fixed to the hardware, so the
 * screen's orientation (portrait or landscape) doesn't change the result.
 */
export function cameraHeading({ alpha, beta, gamma }: OrientationReading): number | null {
  if (alpha === null || beta === null || gamma === null) return null;
  const [a, b, g] = [alpha, beta, gamma].map((degrees) => (degrees * Math.PI) / 180) as [number, number, number];

  // The device's −z axis in the Earth frame (x east, y north, z up), from the rotation
  // R = Rz(alpha) · Rx(beta) · Ry(gamma).
  const east = -Math.cos(a) * Math.sin(g) - Math.sin(a) * Math.sin(b) * Math.cos(g);
  const north = Math.cos(a) * Math.sin(b) * Math.cos(g) - Math.sin(a) * Math.sin(g);
  if (Math.hypot(east, north) < MIN_HORIZONTAL_SHARE) return null;

  return ((Math.atan2(east, north) * 180) / Math.PI + 360) % 360;
}

/** Why the sensors can't give a Snapshot; each names what the user can do about it. */
export type SensorProblem =
  | "position-denied"
  | "position-unavailable"
  | "orientation-unavailable"
  | "phone-flat";

export class SensorError extends Error {
  constructor(readonly problem: SensorProblem) {
    super(problem);
  }
}

/** A Snapshot together with the raw orientation reading its heading came from. */
export interface TakenSnapshot {
  snapshot: Snapshot;
  orientation: OrientationReading;
}

export interface Sensors {
  /**
   * Takes a Snapshot: the heading at this instant and the most recent position fix, waiting
   * for the first fix if there isn't one yet. Rejects with a SensorError.
   */
  snapshot(): Promise<TakenSnapshot>;
  stop(): void;
}

/** A fix older than this is stale; the user may have walked on since. */
const MAX_FIX_AGE_MS = 10_000;
/** How long the shutter waits for a fresh fix before giving up. */
const FIX_TIMEOUT_MS = 20_000;

/**
 * Starts watching position and absolute orientation. `onProblem` hears about problems found
 * before any Snapshot is taken, such as location being denied, so the viewfinder can say so.
 */
export function startSensors(onProblem: (problem: SensorProblem) => void): Sensors {
  let orientation: OrientationReading | undefined;
  let fix: GeolocationPosition | undefined;
  let positionProblem: SensorProblem | undefined;
  let stopped = false;
  const fixWaiters = new Set<() => void>();

  const onOrientation = (event: DeviceOrientationEvent) => {
    orientation = { alpha: event.alpha, beta: event.beta, gamma: event.gamma };
  };
  const orientationSupported = "ondeviceorientationabsolute" in window;
  if (orientationSupported) window.addEventListener("deviceorientationabsolute", onOrientation);
  else onProblem("orientation-unavailable");

  const watchId = navigator.geolocation.watchPosition(
    (position) => {
      fix = position;
      positionProblem = undefined;
      for (const wake of fixWaiters) wake();
    },
    (error) => {
      // Timeouts and lost signal are passing; a denial lasts until the user changes it.
      if (error.code !== error.PERMISSION_DENIED) return;
      positionProblem = "position-denied";
      onProblem(positionProblem);
      for (const wake of fixWaiters) wake();
    },
    { enableHighAccuracy: true, maximumAge: 0 },
  );

  const freshFix = () => (fix && Date.now() - fix.timestamp <= MAX_FIX_AGE_MS ? fix : undefined);

  const nextFix = () =>
    new Promise<GeolocationPosition>((resolve, reject) => {
      const settle = () => {
        const current = freshFix();
        if (stopped) finish(() => reject(new Error("Sensors stopped before a position fix arrived")));
        else if (current) finish(() => resolve(current));
        else if (positionProblem) finish(() => reject(new SensorError(positionProblem!)));
      };
      const timer = setTimeout(() => finish(() => reject(new SensorError("position-unavailable"))), FIX_TIMEOUT_MS);
      const finish = (outcome: () => void) => {
        clearTimeout(timer);
        fixWaiters.delete(settle);
        outcome();
      };
      fixWaiters.add(settle);
      settle();
    });

  return {
    async snapshot() {
      // Read the heading first, at the moment of the tap; the position fix may take a while.
      const reading = orientation;
      if (!reading || reading.alpha === null) throw new SensorError("orientation-unavailable");
      const heading = cameraHeading(reading);
      if (heading === null) throw new SensorError("phone-flat");

      const position = await nextFix();
      return {
        snapshot: {
          position: { lat: position.coords.latitude, lon: position.coords.longitude },
          heading,
          accuracyMetres: position.coords.accuracy,
          // Chrome on Android, the only browser with absolute orientation events, never says
          // whether its compass is calibrated.
          compassCalibration: "unknown",
        },
        orientation: reading,
      };
    },
    stop() {
      stopped = true;
      if (orientationSupported) window.removeEventListener("deviceorientationabsolute", onOrientation);
      navigator.geolocation.clearWatch(watchId);
      for (const wake of fixWaiters) wake();
    },
  };
}
