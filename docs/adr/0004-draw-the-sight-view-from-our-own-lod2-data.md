# Draw the Sight View from our own LoD2 data

To help the user tell nearby Candidates apart, the Candidate screen draws a Sight View: the Candidates' Building Shells as seen from the user's position, numbered and highlighted like the list. It is drawn in SVG on the phone from the LoD2 building model the backend already stores, so it needs no outside service, key or billing, and it can number, highlight and make Candidates tappable, which no outside imagery can.

## Considered Options

- **Embedded Google Street View**: rejected. It needs an API key and billing, coverage in German towns is patchy and often old, and the app can't mark Candidates in it. A key-free link that opens Street View outside the app is kept as an extra once a Candidate is chosen.
- **Google Photorealistic 3D Tiles or a similar 3D service**: rejected for the same key, billing and dependency reasons, plus a WebGL renderer the app doesn't otherwise need.
- **Extruded Footprints instead of LoD2 surfaces**: rejected. Neighbours of the same height look identical as blocks; the roof shape is what tells them apart, and the GML already holds it.
- **Outlines over the camera image**: rejected for now. A compass error of a few degrees would put outlines on the wrong building and mislead the user (see ADR 0001).
