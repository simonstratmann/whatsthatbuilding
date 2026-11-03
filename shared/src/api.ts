/**
 * What the PWA and the server say to each other: `POST /api/identify` takes an
 * IdentifyRequest and answers with an IdentifyResponse.
 */
import type { LatLng } from "./geo.ts";

export const IDENTIFY_PATH = "/api/identify";
/** Where the PWA reports which Candidate the user chose, for the request log. */
export const CHOICE_PATH = "/api/choice";

/** The moment the user presses the shutter: where they stand and which way they face. */
export interface Snapshot {
  position: LatLng;
  /**
   * Degrees clockwise from north. On the phone this is magnetic north, as the compass reports
   * it; the few degrees of declination fall well inside the Sight Cone.
   */
  heading: number;
  /** How far off the position may be, in metres, as the GPS reports it. */
  accuracyMetres: number;
  compassCalibration: CompassCalibration;
}

/**
 * Whether the compass the heading came from is calibrated, as far as the platform says:
 * "uncalibrated" when it reports the compass as unreliable, "unknown" when it can't tell
 * (Chrome on Android never says).
 */
export type CompassCalibration = "calibrated" | "uncalibrated" | "unknown";

export const COMPASS_CALIBRATIONS: readonly CompassCalibration[] = ["calibrated", "uncalibrated", "unknown"];

/** An absolute device-orientation reading, in degrees, as the DeviceOrientation spec defines it. */
export interface OrientationReading {
  alpha: number | null;
  beta: number | null;
  gamma: number | null;
}

export interface IdentifyRequest {
  snapshot: Snapshot;
  /** Where the Snapshot was taken: on the phone, or in dev mode at a desk. */
  mode: "phone" | "dev";
  /** The raw absolute-orientation reading the heading came from (phone only), for the request log. */
  orientation?: OrientationReading;
}

/** What identifying a Snapshot came to: the Identification, or why there is none. */
export type IdentificationOutcome = { identification: Identification } | { error: string };

/**
 * Every answer carries the request ID, which the screen shows so a test can be looked up in
 * the server's request log. A failed identification (status 502) carries the error instead.
 */
export type IdentifyResponse = { requestId: string } & IdentificationOutcome;

/** A building's outline on the ground, with its height, function and address, from the LoD2 building model. */
export interface Footprint {
  /** The building's ID in the building model (its gml:id). */
  id: string;
  /** Outer rings, without courtyards; a building made of several parts has several. */
  rings: LatLng[][];
  /** The middle of the Footprint, where the building's Location pin goes. */
  centre: LatLng;
  /** From the ground to the highest point of the roof, as the building model measures it. */
  heightMetres?: number;
  /** The AdV building function code, e.g. "31001_1000" (Wohnhaus). */
  functionCode?: string;
  address?: Address;
  /** The building's name, from OpenStreetMap; the building model has none. Only Candidates carry it. */
  name?: string;
}

/** A building's address, from the building model. */
export interface Address {
  street?: string;
  houseNumber?: string;
  city?: string;
}

/** Where a chosen building is, as handed to the user's maps app. */
export interface Location {
  position: LatLng;
  /** The building's name, else its street and house number; absent when neither is known. */
  label?: string;
  /** Opens the Location in the default maps app on Android: a pin at the position, named by the label. */
  geoUri: string;
}

export interface Candidate {
  /** 1-based, in rank order: Candidates the user can see nearest first, then Hidden Candidates nearest first. */
  number: number;
  footprint: Footprint;
  distanceMetres: number;
  location: Location;
  /** A short German name for what the building is, e.g. "Wohnhaus"; absent when the building model doesn't say. */
  buildingType?: string;
}

/**
 * Something the user should know about an Identification. "outside-coverage-area": the
 * Snapshot was taken where the app has no building data, so there are no Candidates.
 */
export type IdentificationWarning = "outside-coverage-area";

export interface Identification {
  candidates: Candidate[];
  warnings: IdentificationWarning[];
  /** The Sight Cone that was searched: the user's position, then the far arc from left to right. */
  sightCone: LatLng[];
  /** From the user along their heading to the far edge of the Sight Cone. */
  lineOfSight: { from: LatLng; to: LatLng };
}

/** The user's choice of a Candidate, added to its request's log entry. */
export interface Choice {
  number: number;
  footprintId: string;
  at: string;
}

export interface ChoiceReport {
  requestId: string;
  choice: Choice;
}
