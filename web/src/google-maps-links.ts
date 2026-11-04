import { bearing, type LatLng } from "@whatisthatbuilding/shared";

const DECIMAL_PLACES = 7;

/**
 * Google Maps' key-free URL that opens Street View at `from`, turned towards `towards`
 * (a building's centre). Where Google has no imagery there, it shows the nearest it has.
 */
export function streetViewUrl(from: LatLng, towards: LatLng): string {
  const heading = Math.round(bearing(from, towards)) % 360;
  const params = new URLSearchParams({
    api: "1",
    map_action: "pano",
    viewpoint: `${degrees(from.lat)},${degrees(from.lon)}`,
    heading: String(heading),
  });
  // URLSearchParams would write the comma as %2C; Google reads either, people read this one.
  return `https://www.google.com/maps/@?${params.toString().replace(/%2C/g, ",")}`;
}

/**
 * Google Maps' key-free URL that opens a pin at the position: on a phone in the Google Maps app,
 * elsewhere in the browser. For desktops, where the geo: URI of a Location opens nothing.
 */
export function mapsPinUrl({ lat, lon }: LatLng): string {
  const params = new URLSearchParams({ api: "1", query: `${degrees(lat)},${degrees(lon)}` });
  return `https://www.google.com/maps/search/?${params.toString().replace(/%2C/g, ",")}`;
}

function degrees(value: number): string {
  return String(Number(value.toFixed(DECIMAL_PLACES)));
}
