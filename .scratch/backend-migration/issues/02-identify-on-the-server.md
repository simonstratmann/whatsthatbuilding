# 02: Identify on the server

**What to build:** The phone and dev mode send the Snapshot to `POST /api/identify` and draw the Candidates the backend returns. A single Node service (Fastify or Hono) serves the built PWA and the API, replacing the nginx inside the image. The Identification module and its tests move to the server; Footprints still come from Overpass, now requested by the server. The request and response types live in `shared`. The browser no longer talks to Overpass at all, so the `/api/interpreter` proxy rules go. Local dev keeps hot reload for the PWA while forwarding `/api/*` to the Node service. Behaviour for the user is unchanged. See ADR 0003 and the spec (Server, API).

**Blocked by:** 01 (Split the repo into web, server and shared)

**Status:** ready-for-agent

- [ ] `POST /api/identify` takes a Snapshot and returns Candidates, warnings, Sight Cone and Line of Sight, typed in `shared`
- [x] The phone and dev mode use the API; no identification or Overpass code runs in the browser
- [x] The production image runs only the Node service (no nginx); `OVERPASS_URL` is read by the server
- [x] `/api/interpreter` and its nginx/Vite proxy rules are removed
- [x] Failed Overpass requests are logged by the server and reach the phone as the existing "map data can't be fetched" message
- [x] Identification tests run against the server-side module; one end-to-end test calls `/api/identify` with a fake Footprint source
- [x] Local dev (`npm run dev`) serves the PWA with hot reload and the API together
- [x] Docs referring to the Overpass proxy (`.env.example`, Compose comments) are updated

## Comments

- Done with Hono on Node 24, which runs the server's TypeScript as is (no build step). `npm run dev` runs the API inside the Vite dev server (a plugin in `web/dev-server/api.ts`), so there's one process. Server code changes need a restart.
- The request log moved to the server: it records the Overpass traffic itself and gives out the request ID. `REQUEST_LOG_DIR` turns it on (set in the dev image and in `npm run dev`). Choices go to `POST /api/choice`.
- The server sends a User-Agent naming the app to Overpass. Without one the public server answers 406; the browser's User-Agent used to pass through the proxy.
- Left open: the response has no `warnings` field and the Snapshot has no compass-calibration state, because neither exists in the app yet (behaviour is unchanged). Both move to ticket 03, which adds the first warning (outside the Coverage Area) and has the viewfinder report its calibration state.
- Choices are now sent to `POST /api/choice` from every build; the server drops them unless the request log is on.
- The image listens on 8080 as the `node` user, and Compose maps 8080→8080 and 4173→8080. The dev image no longer needs `ALLOWED_HOSTS`/`DEV_HOST`.
- Request IDs use the server's local time; the image sets `TZ=Europe/Berlin`.
- Still to check by hand: a Snapshot on the phone.
