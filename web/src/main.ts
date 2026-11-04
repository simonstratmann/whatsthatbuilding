import "./style.css";
import { startDemo } from "./demo.ts";
import { demoSnapshotFromPath } from "./demo-path.ts";
import { startDevMode } from "./dev-mode.ts";
import { startPhone } from "./phone.ts";

const app = document.querySelector<HTMLDivElement>("#app")!;
// A demo link, e.g. /52.37446,9.73862,200: that Snapshot's Candidates, without the camera.
const demoSnapshot = demoSnapshotFromPath(location.pathname);

if (demoSnapshot) {
  void startDemo(app, demoSnapshot);
} else if (new URLSearchParams(location.search).has("dev")) {
  startDevMode(app);
} else {
  void startPhone(app);
}

// The installed app starts from the cached shell. The dev server has no service worker to offer.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch((error: unknown) => {
    console.warn("Service worker not registered", error);
  });
}
