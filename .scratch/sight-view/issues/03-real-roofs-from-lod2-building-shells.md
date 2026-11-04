# 03: Real roofs from LoD2 Building Shells

**What to build:** The Sight View draws each Candidate's real walls and roof from the LoD2 building model instead of a block.

- **Parser:** keeps the 3D polygons of the wall, roof and ground surfaces of each building and its building parts, alongside the Footprint. Interior rings are dropped.
- **Store:** keeps the Building Shell with the Footprint. A schema version on each LoD2 tile records whether its buildings carry Shells. The first time a Snapshot needs a tile with an older version, the store re-reads it from the GML file cache with no download. The Hamburg import writes the current version.
- **Identification:** uses the stored Shell in east/north/up metres relative to the user, flattened onto the building's own ground (up measured from the lowest point of its own Shell). It falls back to the block from 02 when a building has no Shell.

See the spec (Parsing, Storage, Local coordinates) and ADR 0004.

**Blocked by:** 02 (Sight View with block buildings)

**Status:** ready-for-human

- [x] `parseLod2Tile` gives each building in the Hamburg and Niedersachsen fixtures a Shell with its wall, roof and ground surfaces in 3D, including those of its building parts (tested)
- [x] Shells survive a write and read in the store (tested against test PostGIS)
- [x] A tile with an older schema version is re-read from the GML cache when first needed, without a download (tested)
- [x] A Hamburg import writes tiles at the current schema version (tested)
- [x] `identify()` returns the stored Shell flattened onto the building's own ground and rounded to 0.1 m, and the block when there's no Shell (tested)
- [x] The identify response for about 20 Candidates stays around 100 KB before gzip at a dense city-centre spot (measured; note the figure in a comment)
- [ ] Checked by hand on a phone: roof shapes (gables, towers) in the Sight View match the buildings in front

## Comments

- Measured at Kröpcke, Hannover, facing 200°: 94 KB for 8 Candidates (the list stops at 8), 16 KB gzipped. Noted in `identification.ts`.
- Checked in dev mode against a local PostGIS whose Hannover tiles were stored before this change: the four tiles were read again from the GML cache on the first Snapshot, with no download, and the Sight View showed the sloped roofs on the Marktkirche square.
- When the GPS puts the user inside a building, that Candidate's own ceiling fills the Sight View. Worth deciding whether to leave the building the user stands in out of the drawing.
