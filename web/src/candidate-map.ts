import L from "leaflet";
import type { Candidate, Identification } from "@whatisthatbuilding/shared";
import { addBaseLayers, addBuildingDataCredit, toLeaflet } from "./leaflet-map.ts";
import { slotClass } from "./candidate-slots.ts";

const FIT_PADDING_PIXELS = 24;

/** One of the pictures of the Candidates that follow the user's choice: the map, the Sight View. */
export interface CandidatePicture {
  /** Highlights the chosen Candidate, by number, and no other. */
  highlight(chosen: number): void;
  destroy(): void;
}

/**
 * The mini-map: the user's position, Line of Sight, Sight Cone and numbered Footprints, fitted
 * to them. Tapping a Footprint or its number calls `onTap`.
 */
export function drawCandidateMap(
  element: HTMLElement,
  { candidates, sightCone, lineOfSight }: Identification,
  onTap: (candidate: Candidate) => void,
): CandidatePicture {
  const map = L.map(element, { zoomSnap: 0.25 });
  addBaseLayers(map);
  addBuildingDataCredit(map);

  L.polygon(sightCone.map(toLeaflet), { className: "sight-cone", interactive: false }).addTo(map);
  L.polyline([toLeaflet(lineOfSight.from), toLeaflet(lineOfSight.to)], {
    className: "line-of-sight",
    interactive: false,
  }).addTo(map);

  const footprints = candidates.map((candidate) => ({
    number: candidate.number,
    // Each ring is its own outer ring, not a hole, so wrap it as a separate polygon part.
    polygon: L.polygon(candidate.footprint.rings.map((ring) => [ring.map(toLeaflet)]), {
      className: `footprint ${slotClass(candidate.number)}`,
    })
      .bindTooltip(String(candidate.number), {
        permanent: true,
        direction: "center",
        className: `footprint-number ${slotClass(candidate.number)}`,
        interactive: true,
      })
      .on("click", () => onTap(candidate))
      .addTo(map),
  }));

  L.circleMarker(toLeaflet(lineOfSight.from), { className: "user-position", radius: 7, interactive: false }).addTo(map);

  const bounds = L.latLngBounds([toLeaflet(lineOfSight.from)]);
  for (const { polygon } of footprints) bounds.extend(polygon.getBounds());
  map.fitBounds(bounds, { padding: [FIT_PADDING_PIXELS, FIT_PADDING_PIXELS] });

  return {
    highlight(chosen) {
      element.classList.add("has-selection");
      for (const { number, polygon } of footprints) {
        const isChosen = number === chosen;
        polygon.getElement()?.classList.toggle("chosen", isChosen);
        polygon.getTooltip()?.getElement()?.classList.toggle("chosen", isChosen);
        if (isChosen) polygon.bringToFront();
      }
    },
    destroy() {
      map.remove();
    },
  };
}
