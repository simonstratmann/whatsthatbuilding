import type { Candidate } from "@whatisthatbuilding/shared";
import { showCandidateScreen, type CandidateScreen } from "./candidate-screen.ts";
import { logChoice, type IdentifyAttempt } from "./identify-client.ts";
import { streetViewUrl } from "./street-view-link.ts";

export interface IdentificationScreenOptions {
  /** Class of the element the Candidates or the error go in. */
  className?: string;
  /** Called when the user chooses a Candidate, just before its Location goes to the maps app. */
  onChoose?: (candidate: Candidate) => void;
  /** Sends the same Snapshot again; offered when the server couldn't be asked or failed. */
  onRetry?: () => void;
  /** Back to the viewfinder for another Snapshot; offered on every outcome. */
  onBack?: () => void;
}

/**
 * What a Snapshot led to, on the phone and in dev mode alike: its request ID, then the
 * Candidates or why there are none. Choosing a Candidate logs the choice, opens its
 * Location in the maps app, and offers a link to Street View facing it.
 */
export function showIdentificationScreen(
  container: HTMLElement,
  attempt: IdentifyAttempt,
  { className, onChoose, onRetry, onBack }: IdentificationScreenOptions = {},
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
  const handOff = document.createElement("p");
  handOff.className = "hand-off";
  handOff.hidden = true;
  const streetView = document.createElement("a");
  streetView.textContent = "Street View";
  // Outside the app, never in place of it.
  streetView.target = "_blank";
  streetView.rel = "noopener";
  handOff.append(streetView);

  const candidateScreen = showCandidateScreen(screen, identification, (candidate) => {
    logChoice(requestId, candidate);
    onChoose?.(candidate);
    streetView.href = streetViewUrl(identification.lineOfSight.from, candidate.footprint.centre);
    streetView.setAttribute("aria-label", `Street View facing Candidate ${candidate.number}`);
    handOff.hidden = false;
    // On a desktop browser this may ask which app should open it.
    window.location.href = candidate.location.geoUri;
  });
  screen.append(handOff);
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
