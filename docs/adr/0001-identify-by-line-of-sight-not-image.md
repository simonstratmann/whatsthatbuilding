# Identify buildings by line of sight, not by image recognition

The app identifies a building from the user's GPS position and compass heading at the Snapshot, intersecting the Line of Sight with building Footprints from map data. The camera image is not analysed. Image and landmark recognition only covers well-known buildings, while map data covers almost every building and costs nothing. Compass inaccuracy is handled by always asking the user to pick from a list of Candidates instead of guessing.

## Considered Options

- **Image recognition (vision model / landmark API)**: rejected because ordinary buildings aren't recognisable, and it adds per-request cost.
- **Geometry plus image ranking**: deferred; it could be layered on later if choosing from the Candidate list proves tedious.
