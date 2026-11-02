import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { renderCandidateList } from "./candidate-list";
import { bearing, destination, type LatLng } from "./geo";
import { identify } from "./identification";
import { overpassFootprintSource } from "./overpass";

const START: LatLng = { lat: 52.5219, lon: 13.4132 }; // Alexanderplatz, Berlin
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
      </aside>
    </div>`;

  const map = L.map(app.querySelector<HTMLElement>("#dev-map")!).setView([START.lat, START.lon], 17);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);

  const reading = app.querySelector<HTMLElement>("#reading")!;
  const candidateArea = app.querySelector<HTMLElement>("#candidates")!;
  const button = app.querySelector<HTMLButtonElement>("#snapshot")!;
  const source = overpassFootprintSource();

  let position = START;
  let heading = 0;

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
    candidateArea.innerHTML = `<p class="notice">Looking for buildings…</p>`;
    try {
      const { candidates } = await identify({ position, heading }, source);
      renderCandidateList(candidateArea, candidates);
    } catch (error) {
      candidateArea.innerHTML = `<p class="notice">Couldn't fetch map data: ${String(error)}</p>`;
    } finally {
      button.disabled = false;
    }
  });

  redraw();
}

function toLeaflet(p: LatLng): L.LatLngTuple {
  return [p.lat, p.lon];
}

function fromLeaflet(p: L.LatLng): LatLng {
  return { lat: p.lat, lon: p.lng };
}
