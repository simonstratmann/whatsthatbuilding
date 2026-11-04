# 04: Surroundings in grey

**What to build:** The Sight View also draws the buildings around the Sight Cone, in grey, so the user can orient themselves. Identification picks out the Surroundings: buildings within ±30° of the heading and within the Sight Cone's range (500 m) that aren't Candidates. The identify response gains a `surroundings` list of Building Shells with their Footprint IDs only, with no labels and no Overpass lookups. The projection orders the Surroundings back to front among the Candidates. The SVG layer draws them grey, roofs shaded differently from walls, and they ignore taps. They use the real Shell when 03 has landed and blocks otherwise. See the spec (Identification, API contract, Sight View drawing).

**Blocked by:** 02 (Sight View with block buildings)

**Status:** ready-for-agent

- [ ] `identify()` returns as Surroundings the buildings within ±30° and 500 m that aren't Candidates, and leaves out buildings beyond that or behind the user (tested)
- [ ] A Candidate never also appears in the Surroundings (tested)
- [ ] `POST /api/identify` returns the Surroundings with their Shells and IDs (tested)
- [ ] Projection: a Surroundings building in front of a Candidate comes after it in the draw list and is marked as Surroundings (tested)
- [ ] Tapping a grey building chooses nothing
- [ ] Checked by hand on a phone: the grey buildings help place the Candidates
