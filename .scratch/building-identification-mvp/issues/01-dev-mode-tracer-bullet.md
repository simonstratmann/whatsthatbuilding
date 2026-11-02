# 01: Dev-mode tracer bullet: Snapshot → Candidates on desktop

**What to build:** On a desktop browser, in dev mode, I click a map to set my position and drag to set my heading. The app takes a Snapshot from that, fetches building Footprints from OpenStreetMap, and shows a plain numbered list of the Candidates in the Sight Cone, nearest first, each with its distance.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Vite + TypeScript + Vitest project set up; typecheck, test and build scripts work
- [ ] Identification module takes a Snapshot and a Footprint source and returns ranked Candidates
- [ ] Sight Cone is ±15° around the Line of Sight, up to 500 m; a Footprint partly inside counts; hidden buildings are kept
- [ ] Candidates ordered by distance to the nearest point of the Footprint, capped at 8, numbered from 1
- [ ] Headings either side of north work
- [ ] Overpass Footprint source turns ways and multipolygon relations into Footprints (tested against a saved response)
- [ ] Dev mode (URL flag) sets position by click and heading by drag, and shows the Candidate list
