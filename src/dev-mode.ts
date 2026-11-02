import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { renderCandidateList } from "./candidate-list";
import { identify, type LatLng } from "./identification";
import { overpassFootprintSource } from "./overpass";

const START: LatLng = { lat: 52.5219, lon: 13.4132 }; // Alexanderplatz, Berlin
const HANDLE_DISTANCE_METRES = 150;
const METRES_PER_DEGREE_LAT = 111_320;

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
        <div id="results"></div>
      </aside>
    </div>`;

  const map = L.map(app.querySelector<HTMLElement>("#dev-map")!).setView([START.lat, START.lon], 17);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);

  const reading = app.querySelector<HTMLElement>("#reading")!;
  const results = app.querySelector<HTMLElement>("#results")!;
  const button = app.querySelector<HTMLButtonElement>("#snapshot")!;
  const source = overpassFootprintSource();

  let position = START;
  let heading = 0;

  const you = L.marker(toLeaflet(position), {
    icon: L.divIcon({ className: "dev-you", iconSize: [16, 16] }),
  }).addTo(map);
  const handle = L.marker(toLeaflet(destination(position, heading, HANDLE_DISTANCE_METRES)), {
    icon: L.divIcon({ className: "dev-handle", iconSize: [20, 20] }),
    draggable: true,
  }).addTo(map);
  const lineOfSight = L.polyline([], { color: "#d33", weight: 3 }).addTo(map);

  const redraw = () => {
    you.setLatLng(toLeaflet(position));
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
    results.innerHTML = `<p class="notice">Looking for buildings…</p>`;
    try {
      const { candidates } = await identify({ position, heading }, source);
      renderCandidateList(results, candidates);
    } catch (error) {
      results.innerHTML = `<p class="notice">Couldn't fetch map data: ${String(error)}</p>`;
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

function metresPerDegreeLon(lat: number): number {
  return METRES_PER_DEGREE_LAT * Math.cos((lat * Math.PI) / 180);
}

function destination(from: LatLng, bearingDegrees: number, metres: number): LatLng {
  const radians = (bearingDegrees * Math.PI) / 180;
  return {
    lat: from.lat + (metres * Math.cos(radians)) / METRES_PER_DEGREE_LAT,
    lon: from.lon + (metres * Math.sin(radians)) / metresPerDegreeLon(from.lat),
  };
}

function bearing(from: LatLng, to: LatLng): number {
  const east = (to.lon - from.lon) * metresPerDegreeLon(from.lat);
  const north = (to.lat - from.lat) * METRES_PER_DEGREE_LAT;
  return ((Math.atan2(east, north) * 180) / Math.PI + 360) % 360;
}
