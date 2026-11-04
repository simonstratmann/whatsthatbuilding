# 02: Sight View with block buildings

**What to build:** The first end-to-end Sight View, with each Candidate drawn as a block.

- **Identification:** each Candidate gets a Building Shell made by raising its Footprint to its height, or to a default height when that's unknown. The Shell is in metres east, north and up relative to the user's position, rounded to 0.1 m.
- **Response:** the identify response carries each Candidate's Shell. A Shell is a list of surfaces, each with a kind (`wall`, `roof` or `ground`) and one ring of east/north/up points.
- **Projection:** a new pure web module turns the Identification and the chosen Candidate into the draw list:
  - a fixed ±30° view around the heading, with the eye 1.6 m above the ground
  - surfaces behind the eye or outside the view clipped
  - 2D polygons in back-to-front order, each with its Candidate number, surface kind and whether it's chosen
  - one number position per Candidate, above its highest point
  - the x positions of the Line of Sight and the two Sight Cone edges
- **Drawing:** a thin SVG layer draws the list, using the mini-map's colours (orange, chosen blue) with roofs shaded differently from walls.
- **Candidate screen:** the mini-map box gets a View | Map toggle that opens on View and keeps its state for the Snapshot. Tapping a building or number in the Sight View chooses that Candidate.

Prefactor first: lift the "which Candidate is chosen" highlighting out of the map code, so the map, the list and the Sight View all follow one choice.

See the spec (Local coordinates, API contract, Sight View projection, Sight View drawing, Candidate screen). Real roofs come in 03, Surroundings in 04 and dashed Hidden Candidates in 05.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] `identify()` gives each Candidate a block Shell of its Footprint and height, in east/north/up metres relative to the user, with a default height when it's unknown (tested with a fake Footprint source)
- [ ] `POST /api/identify` returns each Candidate's Shell (tested)
- [ ] Projection: a building straight ahead lands in the middle of the view, one 30° off at the edge, and one behind the user isn't drawn (tested)
- [ ] Projection: a nearer building comes after a farther one in the draw list, and the chosen Candidate is flagged (tested)
- [ ] Projection: each Candidate's number sits above its highest point, and the markers sit at the middle and at ±15° (tested)
- [ ] The View | Map toggle opens on View, switches without rebuilding the map, and keeps its state for the Snapshot
- [ ] Choosing from the Sight View, the map or the list highlights the same Candidate in all three
- [ ] Dev mode shows the Sight View for a desk Snapshot
- [ ] Checked by hand on a phone at a known spot: the blocks line up with the buildings in front
