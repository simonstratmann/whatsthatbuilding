import type { Candidate } from "@whatisthatbuilding/shared";
import { showCandidateScreen, type CandidateScreen } from "./candidate-screen.ts";
import { logChoice, type IdentifyAttempt } from "./identify-client.ts";

export interface IdentificationScreenOptions {
  /** Class of the element the Candidates or the error go in. */
  className?: string;
  /** Called when the user chooses a Candidate, just before its Location goes to the maps app. */
  onChoose?: (candidate: Candidate) => void;
}

/**
 * What a Snapshot led to, on the phone and in dev mode alike: its request ID, then the
 * Candidates or why there are none. Choosing a Candidate logs the choice and opens its
 * Location in the maps app.
 */
export function showIdentificationScreen(
  container: HTMLElement,
  attempt: IdentifyAttempt,
  { className, onChoose }: IdentificationScreenOptions = {},
): CandidateScreen {
  container.innerHTML = "";
  if (attempt.requestId) container.append(requestIdLine(attempt.requestId));
  const screen = document.createElement("div");
  if (className) screen.className = className;
  container.append(screen);

  if ("error" in attempt) {
    const notice = document.createElement("p");
    notice.className = "notice";
    notice.textContent = `Couldn't fetch map data: ${attempt.error}`;
    screen.append(notice);
    return { destroy() {} };
  }
  const { requestId } = attempt;
  return showCandidateScreen(screen, attempt.identification, (candidate) => {
    logChoice(requestId, candidate);
    onChoose?.(candidate);
    // On a desktop browser this may ask which app should open it.
    window.location.href = candidate.location.geoUri;
  });
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
