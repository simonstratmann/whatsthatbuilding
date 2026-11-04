# 04: Surroundings in grey

**What to build:** The Sight View also draws the buildings around the Sight Cone, in grey, so the user can orient themselves. Identification picks out the Surroundings: buildings within ±30° of the heading and within the Sight Cone's range (500 m) that aren't Candidates. The identify response gains a `surroundings` list of Building Shells with their Footprint IDs only, with no labels and no Overpass lookups. The projection orders the Surroundings back to front among the Candidates. The SVG layer draws them grey, roofs shaded differently from walls, and they ignore taps. They use the real Shell when 03 has landed and blocks otherwise. See the spec (Identification, API contract, Sight View drawing).

**Blocked by:** 02 (Sight View with block buildings)

**Status:** ready-for-human

- [x] `identify()` returns as Surroundings the buildings within ±30° and 500 m that aren't Candidates, and leaves out buildings beyond that or behind the user (tested)
- [x] A Candidate never also appears in the Surroundings (tested)
- [x] `POST /api/identify` returns the Surroundings with their Shells and IDs (tested)
- [x] Projection: a Surroundings building in front of a Candidate comes after it in the draw list and is marked as Surroundings (tested)
- [x] Tapping a grey building chooses nothing
- [ ] Checked by hand on a phone: the grey buildings help place the Candidates

## Comments

- All buildings within ±30° and 500 m made the response far too big: 684 KB (94 KB gzipped) at Kröpcke, Hannover, with 244 Surroundings, nearly all hidden behind nearer rooftops. Surroundings now leave out buildings that nearer ones hide completely, found by sweeping the Sight View in 0.25° steps with the same eye-height test as Hidden Candidates. At Kröpcke that leaves 6 Surroundings and 104 KB (17 KB gzipped). CONTEXT.md and the spec say so.
- Checked in headless Chrome at Kröpcke and on Leinstraße: the grey buildings show beside and behind the Candidates, and tapping one chooses nothing. The phone check is still open.
