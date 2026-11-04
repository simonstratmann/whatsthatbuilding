import type { Candidate } from "@whatisthatbuilding/shared";
import { showCandidateScreen, type CandidateScreen } from "./candidate-screen.ts";
import { logChoice, type IdentifyAttempt } from "./identify-client.ts";
import { mapsPinUrl, streetViewUrl } from "./google-maps-links.ts";

export interface IdentificationScreenOptions {
  /** Class of the element the Candidates or the error go in. */
  className?: string;
  /** Called when the user selects a Candidate in the Sight View, on the map or in the list. */
  onSelect?: (candidate: Candidate) => void;
  /** Called when the user opens the selected Candidate's Location in the maps app. */
  onOpenMaps?: (candidate: Candidate) => void;
  /** Sends the same Snapshot again; offered when the server couldn't be asked or failed. */
  onRetry?: () => void;
  /** Back to the viewfinder for another Snapshot; offered on every outcome. */
  onBack?: () => void;
  /**
   * How "Open in maps" opens the Location: by its geo: URI, which the phone hands to the
   * default maps app (the default), or by a Google Maps link in a new tab, which works on any
   * device, as a demo needs.
   */
  mapsLink?: "geo" | "web";
}

/**
 * What a Snapshot led to, on the phone and in dev mode alike: its request ID, then the
 * Candidates or why there are none. Selecting a Candidate only highlights it, so the user can
 * look which it is; then "Open in maps" logs the choice and hands its Location to the maps app,
 * beside a link to Street View facing it.
 */
export function showIdentificationScreen(
  container: HTMLElement,
  attempt: IdentifyAttempt,
  { className, onSelect, onOpenMaps, onRetry, onBack, mapsLink = "geo" }: IdentificationScreenOptions = {},
): CandidateScreen {
  container.innerHTML = "";
  if (attempt.requestId) container.append(requestIdLine(attempt.requestId));
  const screen = document.createElement("div");
  if (className) screen.className = className;
  container.append(screen);

  if ("error" in attempt) {
    const notice = document.createElement("p");
    notice.className = "notice";
    notice.textContent = "Couldn't fetch map data. That's not your aim: check your signal and try again.";
    // The reason as the browser or server gave it, for reporting a test.
    const detail = document.createElement("p");
    detail.className = "error-detail";
    detail.textContent = attempt.error;
    screen.append(notice, detail);
    container.append(actions([onRetry && ["Try again", onRetry], onBack && ["Back", onBack]]));
    return { destroy() {} };
  }
  const { requestId, identification } = attempt;
  const handOff = document.createElement("div");
  handOff.className = "hand-off";
  handOff.hidden = true;
  const maps = document.createElement("a");
  maps.className = "open-maps";
  maps.textContent = "Open in maps";
  const streetView = document.createElement("a");
  streetView.textContent = "Street View";
  for (const link of mapsLink === "web" ? [maps, streetView] : [streetView]) {
    // Outside the app, never in place of it.
    link.target = "_blank";
    link.rel = "noopener";
  }
  handOff.append(maps, streetView);

  let selected: Candidate | undefined;
  maps.addEventListener("click", () => {
    if (!selected) return;
    logChoice(requestId, selected);
    onOpenMaps?.(selected);
  });

  const candidateScreen = showCandidateScreen(screen, identification, (candidate) => {
    selected = candidate;
    onSelect?.(candidate);
    // On a desktop browser a geo: URI may ask which app should open it, or open nothing.
    maps.href = mapsLink === "web" ? mapsPinUrl(candidate.location.position) : candidate.location.geoUri;
    maps.setAttribute("aria-label", `Open Candidate ${candidate.number} in maps`);
    streetView.href = streetViewUrl(identification.lineOfSight.from, candidate.footprint.centre);
    streetView.setAttribute("aria-label", `Street View facing Candidate ${candidate.number}`);
    handOff.hidden = false;
  });
  // Right under the pictures, where the eye is when selecting.
  (screen.querySelector(".pictures") ?? screen).after(handOff);
  const backLabel = identification.candidates.length > 0 ? "None of these: back" : "Take another Snapshot";
  container.append(actions([onBack && [backLabel, onBack]]));
  return candidateScreen;
}

/** A row of buttons, leaving out those not offered. */
function actions(buttons: ([label: string, onClick: () => void] | undefined)[]): HTMLElement {
  const row = document.createElement("div");
  row.className = "actions";
  for (const button of buttons) {
    if (!button) continue;
    const [label, onClick] = button;
    const element = document.createElement("button");
    element.type = "button";
    element.textContent = label;
    element.addEventListener("click", onClick, { once: true });
    row.append(element);
  }
  return row;
}

/** "Request <id>", selectable, so a test on the phone can be named when reporting what went wrong. */
function requestIdLine(requestId: string): HTMLElement {
  const line = document.createElement("p");
  line.className = "request-id";
  const id = document.createElement("code");
  id.textContent = requestId;
  line.append("Request ", id);
  return line;
}
