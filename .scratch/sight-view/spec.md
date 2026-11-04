# Spec: Sight View

Status: ready-for-agent

## Problem Statement

When several Candidates stand close together, the list often doesn't settle which one I mean. Three entries reading "Wohnhaus · 14 m" look the same, and the mini-map shows outlines from above while I'm looking at the buildings from the street. I have to guess, or walk round the block to read a house number. I'd like to see the Candidates the way I see them: their shapes, their roofs, and which one stands in front of which.

## Solution

The Candidate screen gets a **Sight View**: a drawing of the buildings as seen from where I stood when I took the Snapshot, facing the way I faced. Every Candidate is drawn with its real walls and roof from the official LoD2 building model, numbered like the list, in the same colours as the mini-map. The buildings around them are drawn in grey so I can orient myself. Candidates hidden behind nearer buildings show as dashed outlines over the top. The Sight View shares the mini-map's box behind a **View | Map** toggle and opens on View. Tapping a building in it chooses that Candidate, as tapping a Footprint does on the map.

Once I've chosen a Candidate, a **Street View** link next to the maps hand-off opens Google Street View at my position, facing the chosen building, so I can compare it with real photos when Google has coverage there.

Everything in the Sight View comes from the app's own building data, so it needs no outside service or key. See `docs/adr/0004-draw-the-sight-view-from-our-own-lod2-data.md`.

## User Stories

1. As a walker, I want to see the Candidates drawn as they look from where I stand, so that I can match them to the buildings in front of me.
2. As a walker, I want each building's real roof shape drawn (gable, hip, flat, towers, dormers), so that I can tell apart neighbours of the same height and type.
3. As a walker, I want each Candidate in the Sight View to carry the same number as in the list and on the map, so that I can move between the three without confusion.
4. As a walker, I want the number placed above each Candidate's highest point, so that it never covers the building's shape.
5. As a walker, I want the Sight View to open first on the Candidate screen, so that the most helpful picture is the first thing I see.
6. As a walker, I want to switch between View and Map in the same box, so that the screen isn't cramped on my phone.
7. As a walker, I want my View or Map choice to stay put while I look through the Candidates of one Snapshot, so that the screen doesn't jump about.
8. As a walker, I want to tap a building in the Sight View to choose it, so that I can choose as soon as I recognise it.
9. As a walker, I want the chosen Candidate highlighted in blue in the Sight View, on the map and in the list together, so that all three agree on my choice.
10. As a walker, I want walls and roofs shaded differently, so that roof shapes stand out.
11. As a walker, I want the buildings around the Sight Cone drawn in grey, so that I can orient myself by buildings I can see that aren't Candidates.
12. As a walker, I want the grey Surroundings to ignore taps, so that I can't choose a building the app didn't offer.
13. As a walker, I want the Sight View always to span the same width (about what my camera sees), so that the picture's proportions match my view through the phone.
14. As a walker, I want faint lines marking the Line of Sight and the edges of the Sight Cone, so that I see where the app thinks I aimed and where it searched.
15. As a walker, I want a Hidden Candidate drawn as a dashed outline over the buildings in front of it, so that I can spot, say, a tower rising behind a roofline.
16. As a walker, I want a Hidden Candidate numbered like the others, so that I can find it in the list.
17. As a walker, I want nearer buildings drawn over farther ones, so that the picture shows what blocks what.
18. As a walker, I want the Sight View drawn even when there is only one Candidate, so that I can confirm it's the building I mean.
19. As a walker, I want the Sight View to be there as soon as the Candidates arrive, without a second wait, so that it doesn't slow me down.
20. As a walker, I want a building of unknown shape still to appear in the Sight View (as a block of its height), so that no Candidate goes missing from the picture.
21. As a walker, I want the warnings about a rough GPS fix or an uncalibrated compass shown as before, so that I know when the Sight View may be shifted.
22. As a walker, after choosing a Candidate, I want a Street View link next to the maps hand-off, so that I can compare the building with real photos.
23. As a walker, I want Street View to open at my position and turned towards the chosen building, so that I don't have to look for it.
24. As a walker, I want the Street View link to work without the app needing a Google key, so that it costs nothing and needs no setup.
25. As a walker in Hamburg, I want the Sight View to work there as in Niedersachsen, so that the whole Coverage Area behaves the same.
26. As a walker outside the Coverage Area, I want the same "no building data here" message and no Sight View, so that nothing pretends to know what's there.
27. As a walker, I want dev mode to show the Sight View for a Snapshot set at my desk, so that I can check it without going outside.
28. As the developer, I want Building Shells kept for tiles already imported, by re-reading the cached GML, so that I don't have to download Niedersachsen or Hamburg again.
29. As the developer, I want tiles with no Building Shells re-read automatically the first time they're needed, so that the upgrade needs no manual step.
30. As the developer, I want the identify response to stay small enough for a phone on mobile data, so that the Sight View doesn't make identification slow.

## Implementation Decisions

- **Domain terms.** CONTEXT.md gains *Sight View* (avoid: 3D view, render, preview), *Building Shell* (a building's walls and roof surfaces in 3D, from the LoD2 model; avoid: model, mesh, geometry) and *Surroundings* (buildings near the Sight Cone that are drawn but can't be chosen; avoid: context, background buildings). A Footprint stays the outline on the ground; the Building Shell sits beside it.
- **Parsing.** The LoD2 parser keeps, for each building and its parts, the polygons of its wall, roof and ground surfaces as 3D rings, tagged by surface kind, alongside the Footprint it produces now. Coordinates stay in UTM32 metres, with their elevations, until the store writes them. Interior rings of a surface are dropped.
- **Storage.** The store keeps each building's Building Shell with its Footprint, in a form that can be read back as surfaces with their kind and 3D rings. A schema version on each LoD2 tile records whether its buildings carry Building Shells. When a Snapshot needs a tile with an older version, the tile loader (which already fetches Niedersachsen tiles on demand) re-reads it from the GML file cache and has the store swap it in, the same way a newly downloaded Niedersachsen tile is imported. A tile that can't be re-read is answered as it is (with blocks) and not tried again until a restart. The Hamburg import writes the new version, and names each tile after its file so it can be found again.
- **Identification.** Identification already loads every Footprint within the Sight Cone's range (500 m). Buildings nearer than 20 m are left out altogether, as if they weren't there: the app is for buildings farther off than the one the user stands in front of (decided after tickets 01–05). It also picks out the **Surroundings**: buildings within ±30° of the heading and within that range that aren't Candidates, leaving out those that nearer buildings hide completely (as Hidden Candidates are told, but across the whole Sight View). Drawing those would change nothing in the picture: at Kröpcke they were 238 of 244 buildings and about 500 KB of the response. Ranking, hidden tests and warnings stay as they are.
- **Local coordinates.** Building Shells reach the phone in metres east, north and up, relative to the user's position, rounded to 0.1 m. Each building is flattened onto its own ground: "up" is measured from the lowest point of its own Shell, so each building stands at 0 m. The user's eye is 1.6 m above the ground. A building without a Shell gets one made by raising its Footprint to its height (or a default height when that's unknown too), so every Candidate can be drawn.
- **API contract.** Each Candidate in the identify response carries its Building Shell. The Identification carries a `surroundings` list of Building Shells with their Footprint IDs and nothing else: no labels, no Overpass lookups. Footprints for the map stay in WGS84 as now. A Building Shell is a list of surfaces, each with a kind (`wall`, `roof` or `ground`) and one ring of east/north/up points.
- **Sight View projection (web).** A pure module turns an Identification, plus the chosen Candidate if there is one, into what to draw:
  - The view is a fixed ±30° around the Snapshot heading, with the eye 1.6 m above the ground. It projects in perspective. Surfaces behind the eye or outside the view are clipped.
  - The vertical frame runs from the ground to the top of the tallest drawn building, plus headroom.
  - Its output is a list of 2D polygons in view coordinates, in back-to-front order (by building, then by surface within a building). Each polygon has its Candidate number or Surroundings role, its surface kind, and whether it's chosen.
  - Hidden Candidates come again at the end, as outlines to draw dashed on top.
  - It also gives one number position per Candidate, above its highest projected point, and the x positions of the Line of Sight and the two Sight Cone edges.
- **Sight View drawing (web).** A thin SVG layer draws that output. Candidates are orange, the chosen one blue and Surroundings grey, as on the mini-map, with roofs a different shade from walls. Candidate polygons and numbers are tappable and choose their Candidate. Surroundings aren't tappable. Choosing redraws the highlight in the Sight View, the map and the list together.
- **Candidate screen.** The mini-map box gets a View | Map toggle, opening on View. The toggle keeps its state for the Snapshot. The Leaflet map is still created, so switching is instant and the map keeps its fit.
- **Street View link.** A pure function builds the key-free Google Maps URL that opens Street View (`map_action=pano`) at the user's position, with the heading set to the bearing from the user to the chosen Candidate's centre. The link is shown once a Candidate is chosen, next to the Location hand-off, and opens outside the app.
- **ADR.** `docs/adr/0004-draw-the-sight-view-from-our-own-lod2-data.md` records why the Sight View is drawn from the app's own LoD2 data rather than from an embedded Street View, Google's 3D tiles or another outside service. Those need a key and billing, tie the app to a third party, and can't number or highlight Candidates. Street View stays only as an outward link.

## Testing Decisions

- Tests check what a caller sees, not how it's worked out: which buildings come back, with which coordinates and roles, and what ends up in the draw list. They don't check the internal steps or the SQL.
- **Identification** is tested through `identify()` with fake Footprint and Label sources, as in the existing identification tests:
  - Surroundings are the buildings within ±30° and 500 m that aren't Candidates.
  - Buildings beyond that are left out.
  - Shells come back in east/north/up metres relative to the user, rounded and flattened onto their own ground.
  - A building without a Shell gets a block of its height.
- **The parser** is tested on the existing Hamburg and Niedersachsen GML fixtures, as now: each building's Shell holds its wall, roof and ground surfaces in 3D, including those of its building parts.
- **The store** is tested against the test PostGIS database, as the existing store and loader tests are:
  - Shells survive a write and read.
  - A tile with an older schema version is re-read from the GML cache when first needed, with no download.
  - A Hamburg import writes the current version.
- **The HTTP layer** gets one test in the existing `POST /api/identify` suite: Candidates and Surroundings carry their Shells in the response.
- **The Sight View projection** is a new pure module, tested in the style of the existing candidate-entry tests with hand-built Identifications:
  - A building straight ahead lands in the middle of the view.
  - One 30° to the side lands at the edge, and one behind the user isn't drawn.
  - A nearer building comes after a farther one in the draw list.
  - Hidden Candidates are repeated as dashed outlines at the end.
  - Each Candidate's number sits above its highest point.
  - The Line of Sight and Sight Cone markers sit at the middle and at ±15°.
  - The chosen Candidate is flagged.
- **The Street View link** builder is a pure function with its own tests: its position, its heading towards the chosen building's centre, and the URL's form.
- The SVG drawing, the toggle and tap-to-choose are checked by hand on a phone, at a few known spots in Hamburg and Niedersachsen.

## Out of Scope

- Drawing outlines over the camera image, or keeping the camera frame at all. A compass error of a few degrees would put outlines on the wrong building (ADR 0001 stands).
- Real terrain: estimating the user's ground height or keeping buildings' absolute elevations. Buildings uphill or downhill are drawn as if on level ground.
- Rotating, zooming or panning the Sight View, and any WebGL or 3D library.
- Embedding Street View or any other Google imagery in the app, and anything needing a Google API key.
- Mapillary or other street-level photo services.
- Textures, windows or other façade detail; the LoD2 model has none.
- Showing Building Shells on the mini-map or the Aerial Photo.

## Further Notes

- The parser currently drops everything except the ground rings and the measured height, so most of the data work is keeping what's already in the GML. The GML file cache means the upgrade re-reads files and doesn't download them.
- Flattening each building onto its own ground keeps the picture steady wherever the user's own height is unknown. If Snapshots in hilly towns (Harz, Weserbergland) look wrong, estimating the user's ground from nearby buildings is the next step.
- Building Shells for about 20 Candidates plus Surroundings should come to around 100 KB before gzip. If responses grow much larger, the first fixes are simplifying roof polygons or tightening the Surroundings' range.
- Tickets are in `issues/`. 01 (Street View link) and 02 (the first Sight View, with block buildings) can start straight away. Once 02 is done, 03 (real roofs), 04 (Surroundings) and 05 (dashed Hidden Candidates) can run in parallel.
