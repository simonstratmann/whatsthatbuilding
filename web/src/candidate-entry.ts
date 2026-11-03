import type { Candidate } from "@whatisthatbuilding/shared";

/**
 * A Candidate's list entry after its number (the list draws that): Label, height, building type
 * and distance, e.g. "Lange Str. 12 · 42 m · Wohnhaus · 180 m". Missing parts are left out.
 */
export function candidateEntryText({ location, footprint, buildingType, distanceMetres }: Candidate): string {
  const describing = [
    location.label,
    footprint.heightMetres === undefined ? undefined : formatMetres(footprint.heightMetres),
    buildingType,
  ].filter((part): part is string => Boolean(part));
  if (describing.length === 0) describing.push("Unnamed building");
  return [...describing, formatMetres(distanceMetres)].join(" · ");
}

function formatMetres(metres: number): string {
  return `${Math.round(metres)} m`;
}
