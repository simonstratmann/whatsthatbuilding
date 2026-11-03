# 07: Rank Hidden Candidates below visible ones

**What to build:** A tall building behind a low one ranks above buildings the user can't see. Seen from eye height (1.6 m) at the user's position, a Candidate is a Hidden Candidate when, across the whole part of the Sight Cone it occupies, nearer Footprints rise to a higher elevation angle than its top. Visible Candidates are ranked nearest first, then Hidden Candidates nearest first; the cap of 8 applies to the combined list. Hidden Candidates are never removed. This is a starting rule to tune after real walks. See the spec (Hidden Candidates) and the glossary.

**Blocked by:** 03 (Identify from Hamburg's LoD2 data)

**Status:** resolved

- [x] Identification test: a tall building behind a low one ranks above a nearer, fully hidden building
- [x] Identification test: a fully hidden building stays in the list, below the visible ones
- [x] Identification test: a building hidden only at one edge of its span counts as visible
- [x] Identification test: the cap of 8 applies after visible and hidden are combined
- [x] Footprints without a height are treated as visible and don't hide others
- [x] The existing "tower behind a shop" scenario is updated to the new ranking

## Comments

Decisions made while implementing, to tune after real walks:

- **Looking along the span.** Each Candidate is looked at along bearings spread evenly across the part of the Sight Cone it covers, edge to edge, at most 0.5° apart and at least 9. Along each bearing, the Candidate's top is at its nearest point on it; a nearer Footprint hides it there when its own top, at its nearest point, is at a higher angle. A Candidate is hidden when it is hidden along every bearing that meets it. A gap between two nearer buildings narrower than 0.5° (under 1 m at 100 m) can be missed, which wrongly hides what shows through it.
- **Flat ground.** Heights are measured from each building's own ground, so a slope between the user and a building is ignored.
- **Not hiding.** Footprints of unknown height are never hidden and hide nothing. Neither does a building the user stands in: with GPS error near a facade it would hide everything.
- **Blockers.** Only Footprints that reach into the Sight Cone can block, which is every one that can stand on a line through it.
- **Checked on real data.** At Kröpcke, Hannover (LGLN tiles), facing east the 4–6 m courtyard buildings behind a 23 m front building rank below it; facing west the Georgstraße frontages stay visible. Identification takes about 0.5 s with the tiles loaded.
