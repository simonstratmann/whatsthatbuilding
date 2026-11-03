/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "true" builds the app to send each request to the server's request log. */
  readonly VITE_REQUEST_LOG?: string;
}
