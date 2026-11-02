# 03: Open Location in maps app

**What to build:** Each Candidate shows its name, or else its address, when known. Choosing a Candidate opens its Location (a pin at the building's centre, with the label) in my default maps app.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] Label prefers the OSM name, then street + house number, then none
- [ ] Location is the Footprint's centre point
- [ ] `geo:` link contains the centre point and the label, correctly encoded
- [ ] Choosing a Candidate opens the `geo:` link
