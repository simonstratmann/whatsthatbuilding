import "./style.css";
import { startDevMode } from "./dev-mode";

const app = document.querySelector<HTMLDivElement>("#app")!;

if (new URLSearchParams(location.search).has("dev")) {
  startDevMode(app);
} else {
  app.innerHTML = `<p class="notice">The phone viewfinder isn't built yet. Open this page with <code>?dev</code> to aim from a map.</p>`;
}
