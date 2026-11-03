# 05: Names from Overpass on LoD2 Candidates

**What to build:** Candidates show a building's name when OpenStreetMap has one. For each Snapshot the server asks Overpass for named ways, relations and nodes within 500 m and attaches each name to the LoD2 Footprint that contains it; a building's own name beats a name from a point inside it. Labels prefer the name, then the address, then nothing. If Overpass fails, Candidates keep their address Labels and the failure is logged; identification never fails because of names. See the spec (Label source, Labels).

**Blocked by:** 03 (Identify from Hamburg's LoD2 data)

**Status:** resolved

- [x] Tested on a saved Overpass response: a named building, and a named point inside an unnamed building
- [x] A building's own name wins over a named point inside it
- [x] An Identification test: an OSM name beats the address; with no name, the address is the Label
- [x] An Identification test: a failing Label source still gives address Labels
- [x] Overpass failures are logged by the server
- [x] The `geo:` link uses the new Label

## Comments

Decisions made while implementing, to tune after real walks:

- **Which OSM things are asked for.** Named ways and relations tagged `building`, and named nodes that aren't `place`, `highway`, `public_transport` or `memorial` (a suburb's name put on some point, stops at the kerb, Stolpersteine at the door). A named area without a `building` tag, e.g. a school grounds, isn't asked for, so it can't name one of the buildings on it.
- **Matching.** An OSM building names a Footprint when the Footprint's centre lies inside the OSM outline (outer rings only). So an OSM terrace names every LoD2 house in it. A named node names the Footprint it lies inside. The weak spot is an L-shaped Footprint whose centroid lies outside it.
- **Conflicts.** When several different names qualify at the same step (several OSM buildings, or several shops in one building), none is used and the address stays the Label. A mall isn't named after one of its shops.
- **Failures.** A 5 s timeout. An error status, a body that isn't JSON, or a `remark` (a query that timed out or ran out of memory still answers 200) rejects the call. The server logs it under the request ID, and the Candidates keep their address Labels.
- Overpass is asked in parallel with the Footprints, also outside the Coverage Area, where the answer goes unused.
