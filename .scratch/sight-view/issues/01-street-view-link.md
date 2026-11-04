# 01: Street View link for the chosen Candidate

**What to build:** Once the user has chosen a Candidate, a "Street View" link sits next to the Location hand-off. It opens Google Street View outside the app at the user's position, turned towards the chosen building's centre. It uses the key-free Google Maps URL (`map_action=pano`, `viewpoint`, `heading`), so the app needs no API key. A pure function builds the URL from the Snapshot position and the chosen Candidate. The link works the same in dev mode. See the spec (Street View link).

**Blocked by:** None (can start immediately)

**Status:** ready-for-human

- [x] The URL builder puts the user's position in the viewpoint and the bearing from the user to the chosen Candidate's centre in the heading (tested)
- [x] The heading is a whole number of degrees from 0 up to (not including) 360, also for buildings to the north-west (tested)
- [x] The link only appears once a Candidate is chosen, and follows a change of choice
- [x] The link opens outside the app (a new tab or the Google Maps app), never replacing the app's page
- [ ] Checked by hand: on a phone, Street View opens facing the chosen building where Google has coverage
