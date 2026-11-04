import type { Candidate, Identification } from "@whatisthatbuilding/shared";
import { candidateEntryText } from "./candidate-entry.ts";
import { drawCandidateMap, type CandidatePicture } from "./candidate-map.ts";
import { noticesFor } from "./identification-notices.ts";
import { drawSightView } from "./sight-view-drawing.ts";

export interface CandidateScreen {
  /** Tears down the mini-map; call before discarding the container. */
  destroy(): void;
}

type Picture = "view" | "map";

/**
 * The Candidates of one Snapshot: the Sight View or the mini-map, behind a View | Map toggle,
 * above a list in rank order. Tapping a building in either picture or a list entry chooses
 * that Candidate, and all three highlight it.
 */
export function showCandidateScreen(
  container: HTMLElement,
  identification: Identification,
  onChoose: (candidate: Candidate) => void,
): CandidateScreen {
  const { candidates, warnings } = identification;
  container.innerHTML = "";
  for (const text of noticesFor(warnings)) {
    const notice = document.createElement("p");
    notice.className = "notice warning";
    notice.textContent = text;
    container.append(notice);
  }
  if (candidates.length === 0) return { destroy() {} };

  container.insertAdjacentHTML(
    "beforeend",
    `<div class="picture-toggle" role="group" aria-label="Show">
       <button type="button" data-picture="view">View</button><button type="button" data-picture="map">Map</button>
     </div>
     <div class="pictures">
       <div class="picture sight-view-box" data-picture="view"></div>
       <div class="picture mini-map" data-picture="map"></div>
     </div>
     <ol class="candidates"></ol>`,
  );
  const list = container.querySelector<HTMLOListElement>(".candidates")!;
  const pictureBox = (picture: Picture) => container.querySelector<HTMLElement>(`.picture[data-picture="${picture}"]`)!;

  // Both are drawn now, so switching between them is instant and the map keeps its fit.
  const pictures: CandidatePicture[] = [
    drawSightView(pictureBox("view"), identification, choose),
    drawCandidateMap(pictureBox("map"), identification, choose),
  ];

  const items = candidates.map((candidate) => {
    const item = document.createElement("li");
    item.value = candidate.number;
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = candidateEntryText(candidate);
    button.addEventListener("click", () => choose(candidate));
    item.append(button);
    list.append(item);
    return { number: candidate.number, item };
  });

  const toggles = [...container.querySelectorAll<HTMLButtonElement>(".picture-toggle button")];
  const show = (shown: Picture) => {
    for (const button of toggles) button.setAttribute("aria-pressed", String(button.dataset.picture === shown));
    for (const picture of ["view", "map"] as const) pictureBox(picture).classList.toggle("shown", picture === shown);
  };
  for (const button of toggles) button.addEventListener("click", () => show(button.dataset.picture as Picture));
  // The Sight View first: it's the picture most like what the user sees.
  show("view");

  function choose(chosen: Candidate): void {
    for (const picture of pictures) picture.highlight(chosen.number);
    for (const { number, item } of items) item.classList.toggle("chosen", number === chosen.number);
    onChoose(chosen);
  }

  return {
    destroy() {
      for (const picture of pictures) picture.destroy();
    },
  };
}
