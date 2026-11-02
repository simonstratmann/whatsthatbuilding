/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Overpass interpreter endpoint the app queries for Footprints. */
  readonly VITE_OVERPASS_URL?: string;
}
