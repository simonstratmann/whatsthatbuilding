# 05: Warnings and failure states

**What to build:** When my readings are unreliable or nothing can be found, the app tells me so instead of failing silently, and I can always get back to the viewfinder.

**Blocked by:** 04

**Status:** ready-for-human

- [x] "Imprecise location" warning when GPS accuracy is worse than 30 m; Candidates still shown
- [x] "Calibrate compass" prompt when the compass is unreliable or unavailable
- [x] "No buildings found" message with retry when the Sight Cone is empty
- [x] Message with retry when map data can't be fetched
- [x] Loading indicator while fetching; cancel goes back to the viewfinder

## Comments

**2026-11-04 (agent):**
- Warnings are worked out on the server (`server/src/identification.ts`): `imprecise-location` above 30 m, `compass-uncalibrated` and `nothing-found`. The phone shows each as a notice above the Candidates.
- While loading, Cancel goes back to the viewfinder. A failed fetch offers "Try again", which sends the same Snapshot, and "Back".
- Every outcome has a way back to the viewfinder.
- Retry for "No buildings found" goes back to the viewfinder ("Take another Snapshot"), because sending the same Snapshot again would give the same answer.
- Dev mode has checkboxes that simulate a poor fix and an uncalibrated compass.
- Open for a human:
  - Chrome on Android never reports compass calibration, so the calibrate prompt can't appear on the phone. An unavailable compass is caught in the viewfinder ("allow Motion sensors").
  - Nothing has been checked in a browser yet.
