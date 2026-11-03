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

/** The credits the licences of the building models the Footprints come from ask for. */
export function addBuildingDataCredit(map: L.Map): void {
  // LGLN asks for the year the data was obtained; tiles are downloaded as Snapshots need them.
  map.attributionControl.addAttribution(
    `LGLN (${new Date().getFullYear()}) <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>`,
  );
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
