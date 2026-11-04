import type { Snapshot } from "@whatisthatbuilding/shared";
import { CANCELLED, identifyOnServer } from "./identify-client.ts";
import { showIdentificationScreen } from "./identification-screen.ts";

/**
 * A demo link's Snapshot, identified straight away: the Candidates as the phone would show them,
 * for whoever opens the link, with no camera, GPS or compass.
 */
export async function startDemo(app: HTMLElement, snapshot: Snapshot): Promise<void> {
  const { position, heading } = snapshot;
  app.innerHTML = `<div class="demo-intro"><h1>What Is That Building</h1><p class="demo-snapshot"></p></div><div class="demo-answer"></div>`;
  app.querySelector(".demo-snapshot")!.textContent =
    `Standing at ${position.lat.toFixed(5)}, ${position.lon.toFixed(5)}, facing ${Math.round(heading)}° (${compassPoint(heading)}).`;
  const answer = app.querySelector<HTMLElement>(".demo-answer")!;

  const identifyAndShow = async (): Promise<void> => {
    answer.innerHTML = `<p class="notice">Looking for buildings…</p>`;
    const attempt = await identifyOnServer(snapshot, "demo");
    if (attempt === CANCELLED) return;
    showIdentificationScreen(answer, attempt, {
      className: "candidate-screen",
      onRetry: () => void identifyAndShow(),
      // A friend on a laptop has no maps app to hand off to; links work everywhere.
      openMapsOnChoose: false,
    });
  };
  await identifyAndShow();
}

const COMPASS_POINTS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

/** The nearest of the eight compass points, e.g. "SW" for 200°. */
function compassPoint(heading: number): string {
  return COMPASS_POINTS[Math.round(heading / 45) % 8]!;
}
