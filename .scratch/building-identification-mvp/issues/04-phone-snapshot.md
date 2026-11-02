# 04: Phone Snapshot: viewfinder, Crosshair and sensors

**What to build:** On my Android phone over HTTPS, the app opens on the rear camera with a Crosshair and a shutter button. Tapping the shutter takes a Snapshot from my real position, GPS accuracy and compass heading, and shows the Candidate screen.

**Blocked by:** 01

**Status:** resolved

- [x] Rear camera stream fills the screen with a centred Crosshair; no image is stored
- [x] Shutter reads geolocation and absolute device orientation into a Snapshot (heading from magnetic north, corrected for screen orientation; see spec, Sensors)
- [x] Missing or denied permissions show which permission is needed
- [x] Production build is plain static files that can be served from any HTTPS server
