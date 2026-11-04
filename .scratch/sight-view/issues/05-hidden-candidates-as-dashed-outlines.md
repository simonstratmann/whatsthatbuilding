# 05: Hidden Candidates as dashed outlines

**What to build:** A Hidden Candidate, which nearer buildings block completely, shows in the Sight View as a dashed outline in its colour, drawn over everything in front of it and numbered like the others. That way a tower rising behind a roofline can still be spotted and chosen. The projection repeats each Hidden Candidate's outline at the end of the draw list, flagged as hidden. The SVG layer draws those outlines dashed and tappable. See the spec (Sight View projection, Sight View drawing).

**Blocked by:** 02 (Sight View with block buildings)

**Status:** ready-for-agent

- [ ] Projection: each Hidden Candidate is repeated as a hidden outline at the end of the draw list, after every filled polygon, and visible Candidates aren't repeated (tested)
- [ ] A Hidden Candidate's number shows above its highest point (tested)
- [ ] The dashed outline shows the chosen highlight when its Candidate is chosen, and tapping it chooses that Candidate
- [ ] Checked by hand: in dev mode, a Snapshot with a Hidden Candidate shows its dashed outline over the building in front
