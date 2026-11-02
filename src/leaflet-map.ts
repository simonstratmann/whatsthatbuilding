import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { LatLng } from "./geo";

/** OpenStreetMap tiles, with the attribution OSM requires. */
export function addOsmTiles(map: L.Map): void {
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);
}

export function toLeaflet(p: LatLng): L.LatLngTuple {
  return [p.lat, p.lon];
}

export function fromLeaflet(p: L.LatLng): LatLng {
  return { lat: p.lat, lon: p.lng };
}
