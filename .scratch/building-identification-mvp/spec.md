# Spec: Building identification MVP

Status: ready-for-agent

## Problem Statement

When I'm out walking, in my own city or somewhere new, I often see a building and wonder what it is or exactly where it is. Finding it on a map means working out where I'm standing, which way I'm facing and which of many outlines is the building I'm looking at. That takes long enough that I usually give up. Photo-recognition apps only know famous landmarks, not the ordinary building across the street.

## Solution

A web app on my Android phone. I point the camera so the Crosshair is on the building and tap the shutter. The app takes a Snapshot (my position and the direction I'm facing) and finds every building in the Sight Cone around my Line of Sight using OpenStreetMap Footprints. It shows them as numbered Candidates on a small map and in a list ordered nearest first. I tap the one I meant, and its Location opens in my phone's default maps app.

## User Stories

1. As a walker, I want to open the app from my phone's home screen, so that I can identify a building without searching for a website.
2. As a walker, I want the app to open straight into a live camera view, so that I can aim at a building immediately.
3. As a walker, I want a Crosshair fixed in the middle of the camera view, so that I know exactly what I'm aiming at.
4. As a walker, I want to tap a single shutter button to take a Snapshot, so that identifying a building is one action.
5. As a walker, I want the app to record my position and facing direction at the moment of the Snapshot, so that moving my phone afterwards doesn't change the result.
6. As a walker, I want no photo to be stored, so that nothing piles up on my phone and no images leave it.
7. As a first-time user, I want the app to ask for camera, location and motion-sensor permissions with a short explanation, so that I understand why it needs them.
8. As a user who denied a permission, I want a clear message saying which permission is missing and how to grant it, so that I'm not left looking at a broken screen.
9. As a walker, I want to see that the app is working after I take a Snapshot, so that I know it hasn't frozen while it fetches map data.
10. As a walker, I want every building in the Sight Cone offered as a Candidate, so that compass inaccuracy doesn't hide the building I meant.
11. As a walker aiming at a tall building behind a smaller one, I want hidden buildings included as Candidates, so that I can still pick the one I'm actually looking at.
12. As a walker, I want Candidates ordered nearest first, so that the most likely ones are at the top.
13. As a walker, I want at most 8 Candidates, so that the list stays easy to scan.
14. As a walker, I want a mini-map showing my position, my Line of Sight, the Sight Cone and each Candidate's Footprint with its number, so that I can tell which outline is the building in front of me.
15. As a walker, I want each list entry to show its number and distance from me, so that I can match it to the mini-map and to what I see.
16. As a walker, I want a Candidate's name or address shown when the map data has one, so that I can recognise it more easily.
17. As a walker, I want to tap a Candidate either in the list or on the mini-map, so that I can choose whichever is easier.
18. As a walker, I want to choose a Candidate every time instead of the app guessing, so that I never land on the wrong building without noticing.
19. As a walker, I want choosing a Candidate to open its Location in my default maps app, so that I can see it in the app I already use.
20. As a walker, I want the Location to be a pin at the building's centre, labelled with its name or address when known, so that unnamed buildings still work.
21. As a walker, I want to come back from the maps app to the camera view, so that I can identify the next building straight away.
22. As a walker with a poor GPS fix, I want a warning that my position is imprecise alongside the Candidates, so that I know the list might be off and can try again.
23. As a walker whose compass is uncalibrated, I want a prompt to move my phone in a figure-8, so that the next Snapshot is more accurate.
24. As a walker, I want a clear "no buildings found" message with a retry button when the Sight Cone is empty, so that I'm not shown an empty list.
25. As a walker, I want a clear message with a retry option when map data can't be fetched (no signal, service down), so that I know it isn't my aim that failed.
26. As a walker, I want to cancel the Candidate screen and go back to the viewfinder, so that I can take another Snapshot if none of them is right.
27. As the developer, I want a desktop dev mode where I set my position and facing direction by clicking and dragging on a map, so that I can test Candidate finding without walking outside.
28. As the developer, I want dev mode to run the same identification as a real Snapshot, so that what I test at my desk is what runs on the phone.
29. As the developer, I want the app served as static files from my own HTTPS server, so that the phone grants it camera and sensor access and I need no backend.

## Implementation Decisions

- **Platform:** an installable PWA (manifest + service worker for the app shell), built with plain TypeScript and Vite. There is no UI framework. The target is Chrome on Android.
- **Hosting:** static files on the developer's own server, which already has an HTTPS certificate. There is no backend; the browser sends Overpass queries to `/api/interpreter` on the app's own host, which forwards them to the Overpass server named by `OVERPASS_URL` (see docs/adr/0002-proxy-overpass-through-the-app-host.md; locally set in the git-ignored `.env.local`, see `.env.example`). Without it the app uses the public Overpass server.
- **Identification method:** geometry only, never image analysis (see ADR 0001). The camera is only a viewfinder.
- **Modules:**
  - **Identification** (the deep module and the main test seam). Input: a Snapshot (latitude, longitude, heading in degrees from north, GPS accuracy in metres, compass-calibration state) and a Footprint source. Output: a result made of ranked Candidates (number, Footprint, distance from the user, label if known, Location and its `geo:` link) plus warnings (imprecise location, compass needs calibration, nothing found). It owns the Sight Cone geometry, ordering, the cap and labelling.
  - **Footprint source.** An interface that, given a centre and a radius, returns Footprints (outline, centre point, name, address parts). The Overpass implementation asks for building ways and relations within 500 m of the user and converts the OSM data into Footprints. It is the only module that touches the network.
  - **Sensors.** Reads geolocation (position + accuracy) and absolute device orientation (compass heading) and produces a Snapshot. It reads absolute orientation, not relative, and converts the reading to the heading the rear camera faces, whatever the screen orientation. Chrome on Android reports absolute orientation relative to magnetic north and the app doesn't correct for declination: the few degrees it costs in Central Europe fall well inside the ±15° Sight Cone. Revisit if real walks show a consistent offset.
  - **Viewfinder screen.** Rear-camera stream, Crosshair, shutter button, permission handling.
  - **Candidate screen.** Mini-map (MapLibre or Leaflet with OSM tiles) showing the user's position, Line of Sight, Sight Cone and numbered Footprints; a list nearest first; warnings; cancel/retry.
  - **Dev mode.** A map where clicking sets the position and dragging sets the heading; it builds a Snapshot and runs the same Identification module. It is turned on by a URL flag.
- **Sight Cone:** ±15° around the Line of Sight and up to 500 m. A building is a Candidate if any part of its Footprint falls in the cone. Hidden buildings are not removed.
- **Ranking:** order by distance from the user to the nearest point of the Footprint, and cap at 8.
- **Labels:** prefer the OSM `name`; otherwise use street + house number; otherwise no label.
- **Location:** the Footprint's centre point. It is opened with a `geo:` URI containing a query pin and the label in brackets when one exists. On Android this hands off to the default maps app.
- **Warnings:** "imprecise location" when GPS accuracy is worse than a threshold (start at 30 m); "calibrate compass" when the platform reports low compass accuracy or orientation readings are unavailable. Warnings never block the Candidate screen.
- **No persistence:** no Snapshot history, no images stored.

## Testing Decisions

- A good test drives the Identification module through its public entry point with a Snapshot and a fake Footprint source and checks only what it returns: Candidates, warnings, and the Sight Cone and Line of Sight it searched along (which the mini-map draws). Tests never call internal geometry helpers directly, so the geometry can be reworked freely.
- Scenarios to cover, each with hand-made Footprints:
  - a building directly ahead is a Candidate
  - a building just outside the ±15° edge is not a Candidate
  - a building at 510 m is not a Candidate
  - a large building that only partly overlaps the cone is a Candidate
  - a tower hidden behind a shop: both are Candidates, the shop first
  - more than 8 buildings in the cone: only the nearest 8 are returned, numbered 1–8
  - headings either side of north (e.g. 355° and 5°) give the right cone
  - labels: a name is preferred, then an address, then no label
  - the `geo:` link contains the centre point and the label, and is correctly encoded
  - poor GPS accuracy yields the imprecise-location warning
  - an uncalibrated compass yields the calibration warning
  - no Footprints yields the nothing-found warning
- The Overpass Footprint source gets one small test that converts a saved OSM response into Footprints (a way, a multipolygon relation, a building without tags).
- The viewfinder, sensor reading and mini-map rendering are checked by hand on the phone and through dev mode, not by automated tests.
- There is no prior art; this is the first code in the repo. Use Vitest (Vite's default test runner).

## Out of Scope

- Analysing the camera image or recognising landmarks.
- Any information about a building beyond its Location (history, architect, year built, use).
- Using the phone's tilt or building heights to rank Candidates.
- Picking a Candidate automatically without user confirmation.
- Snapshot history, favourites or saved buildings.
- Offline use beyond the app shell, and caching Footprints.
- An Overpass proxy or backend.
- iOS support, native apps and app stores.
- Cost, quotas and data licensing beyond OSM attribution on the mini-map.

## Further Notes

- The public Overpass API can be slow and unreliable (40 s answers and instant 502s were seen while testing). Pointing `OVERPASS_URL` at a self-hosted Overpass instance avoids that; an instance holding a regional extract only finds buildings inside that region.
- The ±15°, 500 m, cap of 8 and 30 m thresholds are starting values to tune after real walks.
- Mini-map tiles from OSM need visible attribution.
- Glossary: see `CONTEXT.md`. Decision record: `docs/adr/0001-identify-by-line-of-sight-not-image.md`.
