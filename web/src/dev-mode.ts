import L from "leaflet";
import { showCandidateScreen, type CandidateScreen } from "./candidate-screen";
import { bearing, destination, type LatLng } from "./geo";
import { addOsmTiles, fromLeaflet, toLeaflet } from "./leaflet-map";
import { identifyAndLog, logChoice } from "./logged-identification";
import { requestIdLine } from "./request-id";

const START: LatLng = { lat: 52.3745, lon: 9.7386 }; // Kröpcke, Hannover
const HANDLE_DISTANCE_METRES = 150;

/**
 * Desktop stand-in for the phone: click the map to set where you stand,
 * drag the arrow handle to set which way you face, then take a Snapshot.
 */
export function startDevMode(app: HTMLElement): void {
  app.innerHTML = `
    <div class="dev-mode">
      <div id="dev-map" class="dev-map"></div>
      <aside class="dev-panel">
        <p class="hint">Click the map to stand somewhere. Drag the arrow to face a building.</p>
        <p class="reading" id="reading"></p>
        <button id="snapshot" type="button">Take Snapshot</button>
        <div id="candidates"></div>
        <p class="chosen-reading" id="chosen"></p>
      </aside>
    </div>`;

  const map = L.map(app.querySelector<HTMLElement>("#dev-map")!).setView([START.lat, START.lon], 17);
  addOsmTiles(map);

  const reading = app.querySelector<HTMLElement>("#reading")!;
  const candidateArea = app.querySelector<HTMLElement>("#candidates")!;
  const chosenReading = app.querySelector<HTMLElement>("#chosen")!;
  const button = app.querySelector<HTMLButtonElement>("#snapshot")!;

  let position = START;
  let heading = 0;
  let candidateScreen: CandidateScreen | undefined;

  const positionMarker = L.marker(toLeaflet(position), {
    icon: L.divIcon({ className: "dev-position", iconSize: [16, 16] }),
  }).addTo(map);
  const handle = L.marker(toLeaflet(destination(position, heading, HANDLE_DISTANCE_METRES)), {
    icon: L.divIcon({ className: "dev-handle", iconSize: [20, 20] }),
    draggable: true,
  }).addTo(map);
  const lineOfSight = L.polyline([], { color: "#d33", weight: 3 }).addTo(map);

  const redraw = () => {
    positionMarker.setLatLng(toLeaflet(position));
    lineOfSight.setLatLngs([toLeaflet(position), handle.getLatLng()]);
    reading.textContent = `${position.lat.toFixed(5)}, ${position.lon.toFixed(5)} · facing ${Math.round(heading)}°`;
  };

  map.on("click", (event: L.LeafletMouseEvent) => {
    position = fromLeaflet(event.latlng);
    handle.setLatLng(toLeaflet(destination(position, heading, HANDLE_DISTANCE_METRES)));
    redraw();
  });
  handle.on("drag", () => {
    heading = bearing(position, fromLeaflet(handle.getLatLng()));
    redraw();
  });

  button.addEventListener("click", async () => {
    button.disabled = true;
    candidateScreen?.destroy();
    candidateScreen = undefined;
    chosenReading.textContent = "";
    candidateArea.innerHTML = `<p class="notice">Looking for buildings…</p>`;
    const result = await identifyAndLog({ position, heading, accuracyMetres: 0 }, "dev");
    button.disabled = false;
    candidateArea.innerHTML = "";
    const screen = document.createElement("div");
    candidateArea.append(requestIdLine(result.requestId), screen);
    if ("error" in result) {
      const notice = document.createElement("p");
      notice.className = "notice";
      notice.textContent = `Couldn't fetch map data: ${String(result.error)}`;
      screen.append(notice);
      return;
    }
    candidateScreen = showCandidateScreen(screen, result.identification, (candidate) => {
      logChoice(result.requestId, candidate);
      chosenReading.textContent = `Chose Candidate ${candidate.number} (${candidate.footprint.id}): ${candidate.location.geoUri}`;
      // The same hand-off as on the phone; a desktop browser may ask which app should open it.
      window.location.href = candidate.location.geoUri;
    });
  });

  redraw();
}
