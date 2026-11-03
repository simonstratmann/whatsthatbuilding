# 06: Show height and building type in the Candidate list

**What to build:** Each Candidate list entry shows the building's height and type alongside its number, Label and distance, e.g. "3 · Lange Str. 12 · 42 m · Wohnhaus · 180 m", so the user can match it to what they see. The API carries height and function per Candidate; AdV function codes are translated to short readable German types. Missing values are simply left out. See the spec (List entries).

**Blocked by:** 03 (Identify from Hamburg's LoD2 data)

**Status:** ready-for-agent

- [ ] The `/api/identify` response includes height and building type per Candidate
- [ ] Common AdV function codes map to readable types; unknown codes fall back to a generic type
- [ ] List entries show number, Label, height in whole metres, type and distance; missing parts are omitted cleanly
- [ ] Checked by hand in dev mode on a Hamburg Snapshot
