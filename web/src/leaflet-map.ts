import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { DOP_PATH, type LatLng } from "@whatisthatbuilding/shared";

const OSM_CREDIT = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

function osmTiles(): L.TileLayer {
  return L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: OSM_CREDIT });
}

/** OpenStreetMap tiles, with the attribution OSM requires. */
export function addOsmTiles(map: L.Map): void {
  osmTiles().addTo(map);
}

const STREET_MAP = "Street map";
const AERIAL_PHOTOS = "Aerial Photos";
/** Which of the two the user last picked, so the next mini-map opens with it. */
const BASE_LAYER_KEY = "mini-map-base-layer";

/**
 * The street map and the Aerial Photos, with a control to switch between them, each with the
 * credits its imagery needs. The OSM credit stays either way: Labels come from OpenStreetMap.
 */
export function addBaseLayers(map: L.Map): void {
  // The licences are those of the building data, whose credits (addBuildingDataCredit) are always shown.
  const aerialPhotos = L.tileLayer(`${DOP_PATH}/{z}/{x}/{y}`, { maxZoom: 19, attribution: "Aerial Photos: LGLN, LGV" });
  const layers = { [STREET_MAP]: osmTiles(), [AERIAL_PHOTOS]: aerialPhotos };
  const picked = localStorage.getItem(BASE_LAYER_KEY) === AERIAL_PHOTOS ? AERIAL_PHOTOS : STREET_MAP;
  layers[picked].addTo(map);
  map.attributionControl.addAttribution(OSM_CREDIT);
  L.control.layers(layers, undefined, { collapsed: false, position: "topright" }).addTo(map);
  map.on("baselayerchange", ({ name }: L.LayersControlEvent) => localStorage.setItem(BASE_LAYER_KEY, name));
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
