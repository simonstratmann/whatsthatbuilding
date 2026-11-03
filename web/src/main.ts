import "./style.css";
import { startDevMode } from "./dev-mode.ts";
import { startPhone } from "./phone.ts";

const app = document.querySelector<HTMLDivElement>("#app")!;

if (new URLSearchParams(location.search).has("dev")) {
  startDevMode(app);
} else {
  void startPhone(app);
}
