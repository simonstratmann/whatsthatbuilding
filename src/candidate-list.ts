import type { Candidate } from "./identification";

/** A plain numbered list of Candidates, nearest first. */
export function renderCandidateList(container: HTMLElement, candidates: Candidate[]): void {
  if (candidates.length === 0) {
    container.innerHTML = `<p class="notice">No buildings found in the Sight Cone.</p>`;
    return;
  }
  const list = document.createElement("ol");
  list.className = "candidates";
  for (const candidate of candidates) {
    const item = document.createElement("li");
    item.value = candidate.number;
    item.textContent = `${candidate.footprint.id} · ${formatDistance(candidate.distanceMetres)}`;
    list.append(item);
  }
  container.replaceChildren(list);
}

function formatDistance(metres: number): string {
  return `${Math.round(metres)} m`;
}
