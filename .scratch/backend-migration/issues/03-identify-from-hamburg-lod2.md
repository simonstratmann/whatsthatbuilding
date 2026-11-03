# 03: Identify from Hamburg's LoD2 data

**What to build:** Candidates in Hamburg come from the official LoD2 building model instead of OSM. PostGIS joins the Compose project. A command downloads Hamburg's yearly LoD2 zip from daten-hamburg.de, parses each tile's CityGML (AdV profile, EPSG:25832) into 2.5D Footprints (outline in WGS84, height, function code, address) and replaces the previous Hamburg import; the GML files are kept in a file cache. Identification reads Footprints from PostGIS, and Labels are the building's address. A Snapshot outside the loaded area returns the outside-Coverage-Area warning and the phone shows "no building data here". The mini-map shows the LGV Hamburg credit. Overpass is no longer used for Footprints. See the spec (LoD2 store, LoD2 parser, Hamburg import, Storage).

**Blocked by:** 02 (Identify on the server)

**Status:** resolved

- [x] The API contract from ticket 02 is completed: the `POST /api/identify` response carries `warnings` (the first being outside the Coverage Area), and the Snapshot carries the compass-calibration state, which the viewfinder reports, all typed in `shared`
- [x] PostGIS runs in Compose (prod and dev) and the schema is created automatically
- [x] The Hamburg import command loads all tiles and can be re-run to replace the previous import
- [x] The parser is tested on a small saved Hamburg CityGML excerpt: outline, height, function and address come out right in WGS84
- [x] Downloaded GML is kept in a file cache on a persistent volume
- [x] Identification uses the LoD2 store; a Snapshot in Hamburg in dev mode shows LoD2 Candidates labelled with addresses
- [x] A Snapshot outside the loaded area shows the "no building data here" message with no Candidates (covered by an Identification test)
- [x] The LoD2 store's "Footprints within 500 m" query is tested against a real PostGIS
- [x] The mini-map shows "Freie und Hansestadt Hamburg, LGV (dl-de/by-2.0)"

## Comments

- PostGIS (`postgis/postgis:17-3.5`) runs in `docker-compose.yml`, shared by both images: one database and one GML cache volume, so Hamburg is imported once. The server creates the schema on first use (under an advisory lock, as both images may start together). `POSTGRES_PASSWORD` is required. For `npm run dev`, `docker-compose.local.yml` runs a local PostGIS; `.env.example` lists `DATABASE_URL` and `LOD2_CACHE_DIR`.
- Import: `npm run import:hamburg` locally, `docker compose run --rm app node server/src/import-hamburg.ts` on the server. Without an argument it asks Hamburg's transparency portal (CKAN, `title:"LoD2-DE Hamburg"`) for the newest `LoD2-DE_HH_<date>.zip` on daten-hamburg.de; a URL argument overrides that. The GML goes to `<LOD2_CACHE_DIR>/hamburg/<release>/`, and a release already there isn't downloaded again. The whole replacement is one transaction: the old data stays in use until it commits and if it fails. Older releases leave the cache afterwards.
- Measured on the 2026-04-28 release: 783 tiles, 388,729 buildings, 6.7 GB of GML, 1.5 minutes to load from the cache, 440 MB peak memory, 191 MB database. A 500 m query near the Rathaus takes about 20 ms (geography GiST index).
- Footprints now carry `heightMetres`, `functionCode` (the raw AdV code; ticket 06 translates it) and `address.city`. Only outer rings are kept, as with OSM; courtyards count as part of the building.
- The Coverage Area is the loaded tiles' squares. `FootprintSource` gained `covers(position)`; outside it Identification returns `warnings: ["outside-coverage-area"]`, no Candidates, and the phone shows "No building data here."
- Overpass is gone from the server for now (source, recorder, `OVERPASS_URL`); ticket 05 brings it back as the Label source. The request log keeps `covered` and the Footprints the store returned instead of the Overpass traffic, so a request can still be replayed.
- `compassCalibration` is `"calibrated" | "uncalibrated" | "unknown"`. Chrome on Android, the only browser with `deviceorientationabsolute`, never reports compass accuracy, so the phone always sends `"unknown"`; dev mode sends `"calibrated"`. The server treats a missing value as `"unknown"`, so pages loaded before this change keep working.
- Dev mode now starts on the Rathausmarkt in Hamburg, since Hannover has no data until ticket 04.
- Tests: the parser runs on three real buildings cut from tile `LoD2_32_565_5933_1_HH` (courtyard, two addresses, city-only address), with expected coordinates from PostGIS's `ST_Transform`. Store and import tests run against a real PostGIS that Testcontainers starts once per run (`TEST_DATABASE_URL` uses an existing one instead), so `npm test` needs Docker.
- For ticket 05: about a dozen buildings per tile carry a `gml:name` in Hamburg's data (e.g. "Handelskammer", "St.-Ansgar-Kirche"). The parser ignores it for now.
- The Coverage Area is the tiles' full 1 km squares, so border tiles reach a little into Schleswig-Holstein and Niedersachsen; a Snapshot there gets "No buildings found" instead of "No building data here". Ticket 04 replaces this with the states' outlines.
- A building listed in two tiles is stored (and counted) once.
- Still to check by hand: a Snapshot on the phone in Hamburg.
