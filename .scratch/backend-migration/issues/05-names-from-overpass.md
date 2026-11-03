# 05: Names from Overpass on LoD2 Candidates

**What to build:** Candidates show a building's name when OpenStreetMap has one. For each Snapshot the server asks Overpass for named ways, relations and nodes within 500 m and attaches each name to the LoD2 Footprint that contains it; a building's own name beats a name from a point inside it. Labels prefer the name, then the address, then nothing. If Overpass fails, Candidates keep their address Labels and the failure is logged; identification never fails because of names. See the spec (Label source, Labels).

**Blocked by:** 03 (Identify from Hamburg's LoD2 data)

**Status:** ready-for-agent

- [ ] Tested on a saved Overpass response: a named building, and a named point inside an unnamed building
- [ ] A building's own name wins over a named point inside it
- [ ] An Identification test: an OSM name beats the address; with no name, the address is the Label
- [ ] An Identification test: a failing Label source still gives address Labels
- [ ] Overpass failures are logged by the server
- [ ] The `geo:` link uses the new Label
