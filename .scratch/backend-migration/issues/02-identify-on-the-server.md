# 02: Identify on the server

**What to build:** The phone and dev mode send the Snapshot to `POST /api/identify` and draw the Candidates the backend returns. A single Node service (Fastify or Hono) serves the built PWA and the API, replacing the nginx inside the image. The Identification module and its tests move to the server; Footprints still come from Overpass, now requested by the server. The request and response types live in `shared`. The browser no longer talks to Overpass at all, so the `/api/interpreter` proxy rules go. Local dev keeps hot reload for the PWA while forwarding `/api/*` to the Node service. Behaviour for the user is unchanged. See ADR 0003 and the spec (Server, API).

**Blocked by:** 01 (Split the repo into web, server and shared)

**Status:** ready-for-agent

- [ ] `POST /api/identify` takes a Snapshot and returns Candidates, warnings, Sight Cone and Line of Sight, typed in `shared`
- [ ] The phone and dev mode use the API; no identification or Overpass code runs in the browser
- [ ] The production image runs only the Node service (no nginx); `OVERPASS_URL` is read by the server
- [ ] `/api/interpreter` and its nginx/Vite proxy rules are removed
- [ ] Failed Overpass requests are logged by the server and reach the phone as the existing "map data can't be fetched" message
- [ ] Identification tests run against the server-side module; one end-to-end test calls `/api/identify` with a fake Footprint source
- [ ] Local dev (`npm run dev`) serves the PWA with hot reload and the API together
- [ ] Docs referring to the Overpass proxy (`.env.example`, Compose comments) are updated
