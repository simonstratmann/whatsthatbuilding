import type { IdentificationWarning } from "@whatisthatbuilding/shared";

const NOTICES: Record<IdentificationWarning, string> = {
  "outside-coverage-area": "No building data here.",
  "imprecise-location":
    "Your position is imprecise, so the list may be off. Step into the open and take another Snapshot.",
  "compass-uncalibrated": "The compass needs calibrating: move the phone in a figure-8 a few times, then take another Snapshot.",
  "nothing-found": "No buildings found in the Sight Cone.",
};

/** What to tell the user about an Identification's warnings, one line each, in the order given. */
export function noticesFor(warnings: readonly IdentificationWarning[]): string[] {
  return warnings.map((warning) => NOTICES[warning]);
}
