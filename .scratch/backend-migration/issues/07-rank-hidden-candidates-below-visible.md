# 07: Rank Hidden Candidates below visible ones

**What to build:** A tall building behind a low one ranks above buildings the user can't see. Seen from eye height (1.6 m) at the user's position, a Candidate is a Hidden Candidate when, across the whole part of the Sight Cone it occupies, nearer Footprints rise to a higher elevation angle than its top. Visible Candidates are ranked nearest first, then Hidden Candidates nearest first; the cap of 8 applies to the combined list. Hidden Candidates are never removed. This is a starting rule to tune after real walks. See the spec (Hidden Candidates) and the glossary.

**Blocked by:** 03 (Identify from Hamburg's LoD2 data)

**Status:** ready-for-agent

- [ ] Identification test: a tall building behind a low one ranks above a nearer, fully hidden building
- [ ] Identification test: a fully hidden building stays in the list, below the visible ones
- [ ] Identification test: a building hidden only at one edge of its span counts as visible
- [ ] Identification test: the cap of 8 applies after visible and hidden are combined
- [ ] Footprints without a height are treated as visible and don't hide others
- [ ] The existing "tower behind a shop" scenario is updated to the new ranking
