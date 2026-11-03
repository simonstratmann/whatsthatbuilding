import { identifyOnServer } from "./identify-client.ts";
import { showResultScreen } from "./result-screen.ts";
import { showViewfinder } from "./viewfinder.ts";

/**
 * The app on the phone: explain the permissions once, then the viewfinder; a Snapshot
 * leads to the Candidate screen, and choosing a Candidate opens its Location in the maps app.
 */
export async function startPhone(app: HTMLElement): Promise<void> {
  if (!window.isSecureContext) {
    app.innerHTML = `<p class="notice">This page must be opened over HTTPS, or the phone won't share its camera and sensors.</p>`;
    return;
  }
  if (await alreadyAllowed()) startViewfinder(app);
  else showIntro(app);
}

function showIntro(app: HTMLElement): void {
  app.innerHTML = `
    <div class="intro">
      <h1>What is that building?</h1>
      <p>Aim the Crosshair at a building and tap the shutter. The app then asks for:</p>
      <ul>
        <li><strong>Camera</strong>, to show what you're aiming at. No photo is taken or stored.</li>
        <li><strong>Location</strong>, to know where you're standing.</li>
        <li><strong>Motion sensors</strong>, to know which way you're facing.</li>
      </ul>
      <button type="button" class="start">Start</button>
    </div>`;
  app.querySelector<HTMLButtonElement>(".start")!.addEventListener("click", () => startViewfinder(app));
}

function startViewfinder(app: HTMLElement): void {
  const viewfinder = showViewfinder(app, async ({ snapshot, orientation }) => {
    viewfinder.destroy();
    app.innerHTML = `<p class="notice">Looking for buildings…</p>`;
    const result = await identifyOnServer(snapshot, "phone", orientation);
    showResultScreen(app, result, { className: "candidate-screen" });
  });
}

/** Whether camera and location were granted before, so the explanation can be skipped. */
async function alreadyAllowed(): Promise<boolean> {
  try {
    const states = await Promise.all(
      (["camera", "geolocation"] as PermissionName[]).map((name) => navigator.permissions.query({ name })),
    );
    return states.every((state) => state.state === "granted");
  } catch {
    // Some browsers can't query the camera permission; explaining once more does no harm.
    return false;
  }
}
