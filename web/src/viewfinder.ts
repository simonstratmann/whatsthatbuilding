import { SensorError, startSensors, type SensorProblem, type TakenSnapshot } from "./sensors";

export interface Viewfinder {
  /** Stops the camera and sensors; call before discarding the container. */
  destroy(): void;
}

/** Where to grant a permission in Chrome on Android. */
const SITE_SETTINGS = "Tap the icon left of the address bar, open Permissions";

type CameraProblem = "camera-denied" | "camera-unavailable";
type ViewfinderProblem = SensorProblem | CameraProblem;

const PROBLEM_MESSAGES: Record<ViewfinderProblem, string> = {
  "camera-denied": `Camera access is blocked. ${SITE_SETTINGS}, allow Camera, then reload.`,
  "camera-unavailable": "No rear camera could be opened. Close other apps using the camera, then reload.",
  "position-denied": `Location access is blocked. ${SITE_SETTINGS}, allow Location, then reload.`,
  "position-unavailable": "Couldn't get a position fix. Check that location is on, step into the open and try again.",
  "orientation-unavailable": `The compass isn't available. ${SITE_SETTINGS}, allow Motion sensors, then reload.`,
  "phone-flat": "Hold the phone upright and aim the Crosshair at the building.",
};

/**
 * The rear camera filling the screen, a Crosshair in the middle and a shutter button.
 * The camera is only a viewfinder: no frame is ever recorded or stored.
 */
export function showViewfinder(container: HTMLElement, onSnapshot: (taken: TakenSnapshot) => void): Viewfinder {
  container.innerHTML = `
    <div class="viewfinder">
      <video class="viewfinder-video" autoplay playsinline muted></video>
      <div class="crosshair" aria-hidden="true"></div>
      <p class="viewfinder-problem" role="alert" hidden></p>
      <button class="shutter" type="button" aria-label="Take Snapshot"></button>
    </div>`;
  const video = container.querySelector<HTMLVideoElement>(".viewfinder-video")!;
  const problemBanner = container.querySelector<HTMLElement>(".viewfinder-problem")!;
  const shutter = container.querySelector<HTMLButtonElement>(".shutter")!;

  const showProblem = (which: ViewfinderProblem) => {
    problemBanner.textContent = PROBLEM_MESSAGES[which];
    problemBanner.hidden = false;
  };

  let destroyed = false;
  let stream: MediaStream | undefined;
  const sensors = startSensors(showProblem);

  navigator.mediaDevices
    .getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false })
    .then((opened) => {
      if (destroyed) return stopStream(opened);
      stream = opened;
      video.srcObject = opened;
    })
    .catch((error: unknown) => {
      if (destroyed) return;
      const denied = error instanceof DOMException && error.name === "NotAllowedError";
      showProblem(denied ? "camera-denied" : "camera-unavailable");
    });

  shutter.addEventListener("click", async () => {
    shutter.disabled = true;
    problemBanner.hidden = true;
    try {
      const taken = await sensors.snapshot();
      if (!destroyed) onSnapshot(taken);
    } catch (error) {
      if (destroyed) return;
      if (!(error instanceof SensorError)) throw error;
      showProblem(error.problem);
    } finally {
      shutter.disabled = false;
    }
  });

  return {
    destroy() {
      destroyed = true;
      sensors.stop();
      if (stream) stopStream(stream);
      video.srcObject = null;
    },
  };
}

function stopStream(stream: MediaStream): void {
  for (const track of stream.getTracks()) track.stop();
}
