import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { LatLng } from "@whatisthatbuilding/shared";

/** OpenStreetMap tiles, with the attribution OSM requires. */
export function addOsmTiles(map: L.Map): void {
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);
}

/** The credit the licence of the building model the Footprints come from asks for. */
export function addBuildingDataCredit(map: L.Map): void {
  map.attributionControl.addAttribution(
    'Freie und Hansestadt Hamburg, LGV (<a href="https://www.govdata.de/dl-de/by-2-0">dl-de/by-2.0</a>)',
  );
}

export function toLeaflet(p: LatLng): L.LatLngTuple {
  return [p.lat, p.lon];
}

export function fromLeaflet(p: L.LatLng): LatLng {
  return { lat: p.lat, lon: p.lng };
}
