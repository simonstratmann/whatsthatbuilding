# 05: Hidden Candidates as dashed outlines

**What to build:** A Hidden Candidate, which nearer buildings block completely, shows in the Sight View as a dashed outline in its colour, drawn over everything in front of it and numbered like the others. That way a tower rising behind a roofline can still be spotted and chosen. The projection repeats each Hidden Candidate's outline at the end of the draw list, flagged as hidden. The SVG layer draws those outlines dashed and tappable. See the spec (Sight View projection, Sight View drawing).

**Blocked by:** 02 (Sight View with block buildings)

**Status:** ready-for-human

- [x] Projection: each Hidden Candidate is repeated as a hidden outline at the end of the draw list, after every filled polygon, and visible Candidates aren't repeated (tested)
- [x] A Hidden Candidate's number shows above its highest point (tested)
- [x] The dashed outline shows the chosen highlight when its Candidate is chosen, and tapping it chooses that Candidate
- [ ] Checked by hand: in dev mode, a Snapshot with a Hidden Candidate shows its dashed outline over the building in front

## Comments

- Candidates now say whether they are hidden (`hidden` in the API); identification already knew.
- An outline is the Hidden Candidate's surfaces again, drawn dashed with a transparent fill so a tap inside it chooses it (checked with a real hit test in headless Chrome at Kröpcke, Hannover).
- The frame used to cut a too-tall picture from the bottom, which at Kröpcke cut away the horizon and every distant Candidate with it. It now keeps the horizon and cuts the top of the near building.
- The dev-mode hand check at a desk is still open.
