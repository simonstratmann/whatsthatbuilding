import { CANCELLED, identifyOnServer } from "./identify-client.ts";
import { showIdentificationScreen } from "./identification-screen.ts";
import type { TakenSnapshot } from "./sensors.ts";
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
  const viewfinder = showViewfinder(app, (taken) => {
    viewfinder.destroy();
    void identifyAndShow(app, taken);
  });
}

/**
 * Sends the Snapshot and shows what came of it. While waiting, which can take a while in a part
 * of Niedersachsen the app hasn't seen yet, the user can cancel back to the viewfinder.
 */
async function identifyAndShow(app: HTMLElement, taken: TakenSnapshot): Promise<void> {
  const cancel = new AbortController();
  app.innerHTML = `
    <div class="loading">
      <p class="notice">Looking for buildings…</p>
      <div class="actions"><button type="button">Cancel</button></div>
    </div>`;
  app.querySelector<HTMLButtonElement>(".loading button")!.addEventListener(
    "click",
    () => {
      cancel.abort();
      startViewfinder(app);
    },
    { once: true },
  );

  const attempt = await identifyOnServer(taken.snapshot, "phone", taken.orientation, cancel.signal);
  if (attempt === CANCELLED || cancel.signal.aborted) return;
  let stopWaiting = (): void => {};
  const closeScreen = (): void => {
    stopWaiting();
    screen.destroy();
  };
  const screen = showIdentificationScreen(app, attempt, {
    className: "candidate-screen",
    // The Location opens in the maps app; coming back from it means the next building.
    onChoose: () => {
      stopWaiting();
      stopWaiting = whenPageReturns(() => {
        closeScreen();
        startViewfinder(app);
      });
    },
    onRetry: () => {
      closeScreen();
      void identifyAndShow(app, taken);
    },
    onBack: () => {
      closeScreen();
      startViewfinder(app);
    },
  });
}

/**
 * Calls back once the page is shown again after being hidden, as when the user comes back from
 * another app. If the page is never hidden (the maps app didn't open), nothing happens.
 * Returns a function that stops waiting.
 */
function whenPageReturns(callback: () => void): () => void {
  let wasHidden = false;
  const listener = (): void => {
    if (document.visibilityState === "hidden") {
      wasHidden = true;
    } else if (wasHidden) {
      stop();
      callback();
    }
  };
  const stop = (): void => document.removeEventListener("visibilitychange", listener);
  document.addEventListener("visibilitychange", listener);
  return stop;
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
