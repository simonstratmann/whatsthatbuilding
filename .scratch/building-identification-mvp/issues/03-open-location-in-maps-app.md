# 03: Open Location in maps app

**What to build:** Each Candidate shows its name, or else its address, when known. Choosing a Candidate opens its Location (a pin at the building's centre, with the label) in my default maps app.

**Blocked by:** 01

**Status:** resolved

- [x] Label prefers the OSM name, then street + house number, then none
- [x] Location is the Footprint's centre point
- [x] `geo:` link contains the centre point and the label, correctly encoded
- [x] Choosing a Candidate opens the `geo:` link
