# 03: Identify from Hamburg's LoD2 data

**What to build:** Candidates in Hamburg come from the official LoD2 building model instead of OSM. PostGIS joins the Compose project. A command downloads Hamburg's yearly LoD2 zip from daten-hamburg.de, parses each tile's CityGML (AdV profile, EPSG:25832) into 2.5D Footprints (outline in WGS84, height, function code, address) and replaces the previous Hamburg import; the GML files are kept in a file cache. Identification reads Footprints from PostGIS, and Labels are the building's address. A Snapshot outside the loaded area returns the outside-Coverage-Area warning and the phone shows "no building data here". The mini-map shows the LGV Hamburg credit. Overpass is no longer used for Footprints. See the spec (LoD2 store, LoD2 parser, Hamburg import, Storage).

**Blocked by:** 02 (Identify on the server)

**Status:** ready-for-agent

- [ ] The API contract from ticket 02 is completed: the `POST /api/identify` response carries `warnings` (the first being outside the Coverage Area), and the Snapshot carries the compass-calibration state, which the viewfinder reports, all typed in `shared`
- [ ] PostGIS runs in Compose (prod and dev) and the schema is created automatically
- [ ] The Hamburg import command loads all tiles and can be re-run to replace the previous import
- [ ] The parser is tested on a small saved Hamburg CityGML excerpt: outline, height, function and address come out right in WGS84
- [ ] Downloaded GML is kept in a file cache on a persistent volume
- [ ] Identification uses the LoD2 store; a Snapshot in Hamburg in dev mode shows LoD2 Candidates labelled with addresses
- [ ] A Snapshot outside the loaded area shows the "no building data here" message with no Candidates (covered by an Identification test)
- [ ] The LoD2 store's "Footprints within 500 m" query is tested against a real PostGIS
- [ ] The mini-map shows "Freie und Hansestadt Hamburg, LGV (dl-de/by-2.0)"
