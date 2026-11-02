# 05: Warnings and failure states

**What to build:** When my readings are unreliable or nothing can be found, the app tells me so instead of failing silently, and I can always get back to the viewfinder.

**Blocked by:** 04

**Status:** ready-for-agent

- [ ] "Imprecise location" warning when GPS accuracy is worse than 30 m; Candidates still shown
- [ ] "Calibrate compass" prompt when the compass is unreliable or unavailable
- [ ] "No buildings found" message with retry when the Sight Cone is empty
- [ ] Message with retry when map data can't be fetched
- [ ] Loading indicator while fetching; cancel goes back to the viewfinder
