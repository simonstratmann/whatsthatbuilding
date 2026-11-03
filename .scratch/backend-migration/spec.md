# Spec: Backend with its own building data

Status: ready-for-agent

## Problem Statement

The app runs entirely in the browser and takes building Footprints from OpenStreetMap through Overpass. OSM outlines are uneven: a row of terraced houses can be one outline, some buildings are missing, and most have no address, so many Candidates are unlabelled. The OSM data has no heights, so a tall building behind a low one is ranked like any other hidden building. I also want to add aerial photos and, later, 3D views. All of that needs official building data and imagery that has to be downloaded, converted and stored, which a static PWA can't do.

## Solution

A Node backend runs identification and owns the building data. The phone still captures the Snapshot and draws the result, but it sends the Snapshot to `POST /api/identify` and gets Candidates back. The backend keeps the official LoD2 building models for Niedersachsen and Hamburg in PostGIS: Niedersachsen tiles are downloaded the first time a Snapshot needs them, and Hamburg is imported once a year. Names still come from OpenStreetMap through my Overpass server. The Candidate list shows each building's height and type, and buildings visible over nearer ones rank above hidden ones. The mini-map can switch to Aerial Photos, which the backend fetches from the state imagery services and caches. See `docs/adr/0003-identify-on-a-backend-with-its-own-building-data.md`.

## User Stories

1. As a walker, I want taking a Snapshot to work exactly as before, so that the move to a backend costs me nothing.
2. As a walker, I want Candidates drawn from official building outlines, so that each house in a row is its own Candidate.
3. As a walker, I want almost every Candidate labelled with an address, so that I can recognise unnamed buildings.
4. As a walker, I want a Candidate's name shown when OpenStreetMap has one, so that well-known buildings are easy to spot.
5. As a walker, I want each list entry to show the building's height and type, so that I can match it to what I see.
6. As a walker aiming at a tall building behind a low one, I want the tall one ranked above buildings I can't see, so that the one I mean is near the top.
7. As a walker, I want fully hidden buildings kept in the list, below the visible ones, so that a wrong height in the data never hides the building I mean.
8. As a walker outside Niedersachsen and Hamburg, I want a clear "no building data here" message, so that I know it isn't my aim that failed.
9. As a walker in a part of Niedersachsen the app hasn't visited yet, I want the progress indicator to stay up while building data downloads, so that I know it hasn't frozen.
10. As a walker, I want to switch the mini-map to Aerial Photos, so that I can match roofs and courtyards to what I see.
11. As a walker, I want Aerial Photos to load quickly in areas I've looked at before, so that the mini-map stays responsive.
12. As a walker, I want Candidates labelled with addresses when the name service is down, so that identification still works.
13. As the developer, I want a command that preloads building data for an area, so that my home area never waits for a download.
14. As the developer, I want a command that imports Hamburg's yearly building model, so that I can refresh it each April.
15. As the developer, I want every failed download from LGLN, Hamburg or Overpass in the backend log, so that I can see what went wrong without debugging on the phone.
16. As the developer, I want dev mode to call the same `/api/identify` as the phone, so that what I test at my desk is what runs outside.
17. As the developer, I want the downloaded building files kept on disk, so that adding 3D later doesn't mean downloading everything again.
18. As the developer, I want the app, its API and PostGIS in one Compose project behind my server's nginx, so that deploying stays one `docker compose up`.

## Implementation Decisions

- **Steps.** Each one ships on its own:
  1. Identification behind `POST /api/identify`, still using Overpass Footprints, with behaviour unchanged. Repo split into `web/`, `server/` and `shared/`. The Node service replaces the nginx inside the image.
  2. PostGIS and LoD2 import, identification switched to LoD2, names from Overpass, the Coverage Area message, height and type in the list, height-aware ranking.
  3. Aerial Photos through the caching proxy.
- **Repo layout.** One repo and one Docker image. `web/` is the PWA (plain TypeScript, Vite, Leaflet, as now). `server/` holds the Node service, LoD2 import and DOP proxy. `shared/` holds the API request and response types, used by both.
- **Server.** One Node service (Fastify or Hono) serves the built PWA and `/api/*`. No auth in the app; the host's nginx with Authentik sits in front. Overpass requests go out from the server, so `/api/interpreter` and the Vite and nginx proxy rules for it are removed.
- **API.** `POST /api/identify` takes a Snapshot (latitude, longitude, heading, GPS accuracy, compass-calibration state). It returns what the Identification module returns today: ranked Candidates, warnings, and the Sight Cone and Line of Sight for the mini-map. Each Candidate also carries height and building function. A new warning reports a Snapshot outside the Coverage Area.
- **Modules:**
  - **Identification** moves to `server/` with its tests, and stays the deep module and main test seam. Its Footprint source becomes the LoD2 store, plus a Label source for names. Ranking gains Hidden Candidates.
  - **LoD2 store.** Answers "Footprints within 500 m" from PostGIS. It knows which 1 km tiles are loaded. For a Niedersachsen tile that isn't loaded, it downloads `https://lod2.s3.eu-de.cloud-object-storage.appdomain.cloud/LoD2_32_{E}_{N}_1_ni.gml` (E/N are lower-left UTM32 coordinates in km), parses it, stores the buildings and keeps the GML in a file cache. It also knows where the Coverage Area ends.
  - **LoD2 parser.** Turns AdV CityGML 1.0 into Footprints: ground outline reprojected from EPSG:25832 to WGS84, measuredHeight, function (AdV code mapped to a readable German type), and the address (street, house number, city). Both states use the same AdV profile; Hamburg's addresses are xAL.
  - **Hamburg import.** A command that downloads `LoD2-DE_HH_<date>.zip` from daten-hamburg.de and imports all its tiles through the same parser, replacing the previous Hamburg import.
  - **Preload command.** Loads all Niedersachsen tiles in a given bounding box.
  - **Label source.** Asks Overpass for named ways, relations and nodes within 500 m and attaches each name to the LoD2 Footprint that contains it. A building's own name beats a name from a point inside it. When Overpass fails, Candidates keep their address Labels and the failure is logged.
  - **DOP proxy.** `GET /api/dop/{z}/{x}/{y}` serves a 256 px tile in EPSG:3857. It requests the area from the Niedersachsen WMS (`https://opendata.lgln.niedersachsen.de/doorman/noauth/dop_wms`, layer `ni_dop20`) or, for tiles inside Hamburg, the Hamburg WMS (`https://geodienste.hamburg.de/wms_dop_zeitreihe_unbelaubt`). Tiles that cross the border come from Niedersachsen. Tiles are cached on disk under a size limit (start at 20 GB), oldest first out. Failed upstream requests are logged.
- **Storage.** Footprints are 2.5D in PostGIS: outline, height, function, address, source tile. Full 3D geometry is not imported; the GML file cache keeps that possible. Disk budget for everything is 200 GB; RAM up to 16 GB at peak.
- **Hidden Candidates.** Seen from eye height (1.6 m) at the user's position, a Candidate is hidden when, across the whole part of the Sight Cone it occupies, nearer Footprints rise to a higher elevation angle than its top. Candidates the user can see are ranked nearest first, then Hidden Candidates nearest first, and the cap of 8 applies to the combined list. This is a starting rule to tune after real walks.
- **Labels.** Prefer the OSM name; otherwise street and house number from the building model; otherwise no Label.
- **List entries.** Number, Label, height (whole metres), building type and distance, e.g. "3 · Lange Str. 12 · 42 m · Wohnhaus · 180 m".
- **Credits.** The mini-map shows "LGLN (year) CC BY 4.0" and "Freie und Hansestadt Hamburg, LGV (dl-de/by-2.0)" next to the OSM credit.
- **Unchanged:** Sight Cone (±15°, 500 m), the `geo:` hand-off, warnings, no Snapshot history, the viewfinder and sensors.

## Testing Decisions

- Identification tests move to `server/` and keep driving the module through its public entry point with fake Footprint and Label sources. New scenarios:
  - a tall building behind a low one ranks above a fully hidden building that is nearer
  - a fully hidden building stays in the list, below visible ones
  - a building partly hidden at one cone edge counts as visible
  - an OSM name beats the address; with no name, the address is the Label
  - a failing Label source still gives address Labels
  - a Snapshot outside the Coverage Area gives the outside-coverage warning and no Candidates
- The LoD2 parser gets a test on a small saved CityGML excerpt from each state: outline, height, function and address come out right, and coordinates land in WGS84.
- The LoD2 store gets a test that the right tiles are computed for a point and radius, including near a tile corner, with the download faked.
- The Label source gets a test on a saved Overpass response: a named building, and a named point inside an unnamed building.
- The DOP proxy gets a test that a tile in Hamburg goes to the Hamburg WMS, one elsewhere goes to Niedersachsen, and a second request is served from the cache.
- `/api/identify` gets one end-to-end test with the server started against fake sources.
- PostGIS queries are tested against a real PostGIS (e.g. via a Compose test service or Testcontainers), not mocked.
- Viewfinder, sensors, map rendering and the Aerial Photo layer are checked by hand on the phone and in dev mode.

## Out of Scope

- 3D models, 3D Tiles and 3D views.
- Building data outside Niedersachsen and Hamburg, and any OSM Footprint fallback.
- Importing all of Niedersachsen up front.
- Auth in the app (Authentik in front handles it).
- Using the phone's tilt to rank Candidates.
- Historic or leaf-on Aerial Photos, and picking the imagery year.
- Hamburg's LoD3 model.
- Snapshot history, favourites, offline use beyond the app shell.

## Further Notes

- LGLN also offers a STAC API (`https://lod.stac.lgln.niedersachsen.de`, collection `lod2`) and a tile index FeatureServer, if computing tile names from coordinates turns out unreliable.
- Niedersachsen LoD2 heights are in DHHN2016 (EPSG:7837). Only relative heights matter for Hidden Candidates, so no vertical transformation is needed.
- The Overpass server must cover the Coverage Area; the self-hosted one holds Germany with daily updates.
- Glossary: `CONTEXT.md`. Decisions: `docs/adr/0001-identify-by-line-of-sight-not-image.md`, `docs/adr/0003-identify-on-a-backend-with-its-own-building-data.md`.
