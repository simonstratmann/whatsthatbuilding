/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Overpass interpreter endpoint the app queries for Footprints. */
  readonly VITE_OVERPASS_URL?: string;
  /** "true" builds the app to send each request to the server's request log. */
  readonly VITE_REQUEST_LOG?: string;
}
