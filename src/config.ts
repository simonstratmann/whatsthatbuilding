/**
 * Settings the server hands the app when it starts, through `config.js` (see docker/write-config.sh),
 * so one built image serves any Overpass server without rebuilding.
 */
export interface RuntimeConfig {
  overpassUrl?: string;
}

declare global {
  interface Window {
    APP_CONFIG?: RuntimeConfig;
  }
}

const PUBLIC_OVERPASS_URL = "https://overpass-api.de/api/interpreter";

/** The Overpass interpreter this page should ask. */
export function overpassUrl(): string {
  return chooseOverpassUrl(
    typeof window === "undefined" ? undefined : window.APP_CONFIG,
    import.meta.env.VITE_OVERPASS_URL,
  );
}

/**
 * The one the server named at start-up, else the one the app was built with
 * (`VITE_OVERPASS_URL`, e.g. from `.env.local`), else the public server.
 */
export function chooseOverpassUrl(runtime: RuntimeConfig | undefined, buildTime: string | undefined): string {
  return runtime?.overpassUrl || buildTime || PUBLIC_OVERPASS_URL;
}
