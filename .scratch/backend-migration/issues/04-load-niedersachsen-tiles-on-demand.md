# 04: Load Niedersachsen tiles on demand

**What to build:** Snapshots anywhere in Niedersachsen get LoD2 Candidates. When a Snapshot's 500 m circle touches 1 km tiles that aren't loaded yet, the server downloads them from LGLN (`LoD2_32_{E}_{N}_1_ni.gml`, E/N the lower-left UTM32 coordinates in km), parses them with the same parser, stores the Footprints, keeps the GML in the file cache, then answers; the phone's progress indicator stays up meanwhile. A command preloads every tile in a bounding box. Download failures are logged and reach the phone as a retryable error. The Coverage Area becomes Niedersachsen and Hamburg. The mini-map shows the LGLN credit. See the spec (LoD2 store, Preload command).

**Blocked by:** 03 (Identify from Hamburg's LoD2 data)

**Status:** ready-for-agent

- [ ] The tiles for a point and radius are computed correctly, including near a tile corner (tested with the download faked)
- [ ] A Snapshot in an unloaded Niedersachsen tile downloads, stores and answers; a second Snapshot there doesn't download again
- [ ] Concurrent Snapshots needing the same tile download it only once
- [ ] The preload command loads all tiles in a given bounding box and skips tiles already loaded
- [ ] The parser is tested on a small saved Niedersachsen CityGML excerpt
- [ ] A failed tile download is logged and shown on the phone as the existing retryable error
- [ ] Snapshots outside Niedersachsen and Hamburg still get the outside-Coverage-Area message
- [ ] The mini-map shows "LGLN (year) CC BY 4.0"
