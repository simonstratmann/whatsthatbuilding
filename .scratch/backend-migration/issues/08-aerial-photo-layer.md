# 08: Aerial Photo layer

**What to build:** The user can switch the mini-map between the street map and Aerial Photos. The server serves `GET /api/dop/{z}/{x}/{y}` as 256 px tiles in EPSG:3857, requesting each from the Hamburg WMS (`wms_dop_zeitreihe_unbelaubt` on geodienste.hamburg.de) for tiles inside Hamburg and from the LGLN WMS (`dop_wms`, layer `ni_dop20`) otherwise, including tiles that cross the border. Tiles are cached on disk under a size limit (start at 20 GB, configurable), oldest out first. Failed upstream requests are logged. The credits for the shown imagery appear on the mini-map. See the spec (DOP proxy, Credits).

**Blocked by:** 02 (Identify on the server)

**Status:** ready-for-agent

- [ ] A tile inside Hamburg is fetched from the Hamburg WMS, any other tile from LGLN (tested with upstream faked)
- [ ] A second request for the same tile is served from the cache (tested)
- [ ] The cache stays under its configured size limit, evicting the oldest tiles first
- [ ] Upstream failures are logged and return an error status, not a broken image cached as a tile
- [ ] The cache lives on a persistent volume in Compose
- [ ] The mini-map has a toggle between street map and Aerial Photos, and shows the matching credits
- [ ] Checked by hand in dev mode in Hamburg and in Niedersachsen
