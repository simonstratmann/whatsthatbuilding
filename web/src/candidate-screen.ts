import L from "leaflet";
import type { Candidate, Identification } from "@whatisthatbuilding/shared";
import { candidateEntryText } from "./candidate-entry.ts";
import { addBaseLayers, addBuildingDataCredit, toLeaflet } from "./leaflet-map.ts";

const FIT_PADDING_PIXELS = 24;

export interface CandidateScreen {
  /** Tears down the mini-map; call before discarding the container. */
  destroy(): void;
}

/**
 * The Candidates of one Snapshot: a mini-map of the user's position, Line of Sight, Sight Cone
 * and numbered Footprints, above a list in rank order. Tapping a Footprint or a list entry
 * chooses that Candidate.
 */
export function showCandidateScreen(
  container: HTMLElement,
  { candidates, warnings, sightCone, lineOfSight }: Identification,
  onChoose: (candidate: Candidate) => void,
): CandidateScreen {
  if (warnings.includes("outside-coverage-area")) {
    container.innerHTML = `<p class="notice">No building data here.</p>`;
    return { destroy() {} };
  }
  if (candidates.length === 0) {
    container.innerHTML = `<p class="notice">No buildings found in the Sight Cone.</p>`;
    return { destroy() {} };
  }

  container.innerHTML = `<div class="mini-map"></div><ol class="candidates"></ol>`;
  const list = container.querySelector<HTMLOListElement>(".candidates")!;
  const map = L.map(container.querySelector<HTMLElement>(".mini-map")!, { zoomSnap: 0.25 });
  addBaseLayers(map);
  addBuildingDataCredit(map);

  L.polygon(sightCone.map(toLeaflet), {
    className: "sight-cone",
    interactive: false,
  }).addTo(map);
  L.polyline([toLeaflet(lineOfSight.from), toLeaflet(lineOfSight.to)], {
    className: "line-of-sight",
    interactive: false,
  }).addTo(map);

  const drawnCandidates = candidates.map((candidate) => {
    // Each ring is its own outer ring, not a hole, so wrap it as a separate polygon part.
    const footprint = L.polygon(candidate.footprint.rings.map((ring) => [ring.map(toLeaflet)]), {
      className: "footprint",
    })
      .bindTooltip(String(candidate.number), {
        permanent: true,
        direction: "center",
        className: "footprint-number",
        interactive: true,
      })
      .on("click", () => choose(candidate))
      .addTo(map);

    const item = document.createElement("li");
    item.value = candidate.number;
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = candidateEntryText(candidate);
    button.addEventListener("click", () => choose(candidate));
    item.append(button);
    list.append(item);

    return { candidate, footprint, item };
  });

  L.circleMarker(toLeaflet(lineOfSight.from), { className: "user-position", radius: 7, interactive: false }).addTo(map);

  const bounds = L.latLngBounds([toLeaflet(lineOfSight.from)]);
  for (const { footprint } of drawnCandidates) bounds.extend(footprint.getBounds());
  map.fitBounds(bounds, { padding: [FIT_PADDING_PIXELS, FIT_PADDING_PIXELS] });

  function choose(chosen: Candidate): void {
    for (const { candidate, footprint, item } of drawnCandidates) {
      const isChosen = candidate === chosen;
      footprint.getElement()?.classList.toggle("chosen", isChosen);
      footprint.getTooltip()?.getElement()?.classList.toggle("chosen", isChosen);
      item.classList.toggle("chosen", isChosen);
      if (isChosen) footprint.bringToFront();
    }
    onChoose(chosen);
  }

  return {
    destroy() {
      map.remove();
    },
  };
}
