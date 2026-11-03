# 06: Show height and building type in the Candidate list

**What to build:** Each Candidate list entry shows the building's height and type alongside its number, Label and distance, e.g. "3 · Lange Str. 12 · 42 m · Wohnhaus · 180 m", so the user can match it to what they see. The API carries height and function per Candidate; AdV function codes are translated to short readable German types. Missing values are simply left out. See the spec (List entries).

**Blocked by:** 03 (Identify from Hamburg's LoD2 data)

**Status:** resolved

- [x] The `/api/identify` response includes height and building type per Candidate
- [x] Common AdV function codes map to readable types; unknown codes fall back to a generic type
- [x] List entries show number, Label, height in whole metres, type and distance; missing parts are omitted cleanly
- [x] Checked by hand in dev mode on a Hamburg Snapshot

## Comments

Decisions made while implementing:

- **Where the type is named.** The server translates the function code (`server/src/building-types.ts`) and sends `buildingType` on each Candidate; height stays on the Footprint as `heightMetres`. The PWA only formats.
- **Which codes.** About 140 common ALKIS Gebäudefunktion codes, shortened to fit a list entry (e.g. 3065 "Kita", 2071 "Hotel"). Any other code is "Gebäude"; a building with no code gets no type.
- **The number.** The ordered list draws it ("3."), as before, so the entry text starts at the Label. An entry with no Label, height or type reads "Unnamed building · 180 m"; with a type but no Label, e.g. "8 m · Garage · 12 m".
- **Hand check.** Dev mode against a throwaway PostGIS holding the Hamburg fixture tile: "Rödingsmarkt 16 · 35 m · Geschäftsgebäude · 80 m".
