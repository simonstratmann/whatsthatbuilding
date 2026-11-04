import "./style.css";
import { startDevMode } from "./dev-mode.ts";
import { startPhone } from "./phone.ts";

const app = document.querySelector<HTMLDivElement>("#app")!;

if (new URLSearchParams(location.search).has("dev")) {
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
