# Identify on a backend with its own building data

Supersedes [0002](0002-proxy-overpass-through-the-app-host.md).

Identification moves from the browser to a Node backend. The phone sends a Snapshot to `POST /api/identify` and draws the Candidates it gets back. The backend keeps official LoD2 building models for Niedersachsen and Hamburg in PostGIS and uses them as the Footprint source. OSM, through the self-hosted Overpass server, now only supplies building names. The phone keeps the camera, sensors and rendering; everything that needs map data or geometry runs on the server.

The reason is the data, not the rendering. LGLN and LGV Hamburg publish LoD2 models as CityGML with official outlines, an ALKIS address on almost every building, heights and building functions. Turning that into something queryable needs downloading, parsing and a spatial database, which a static PWA can't do. Heights also let ranking tell buildings visible over nearer ones from hidden ones. Later 3D views would build on the same stored data.

## How the data gets in

- **Niedersachsen:** LGLN serves each 1×1 km tile at a predictable URL (`LoD2_32_{E}_{N}_1_ni.gml`, lower-left UTM32 km). The backend fetches the tiles a Snapshot needs on first use and keeps them; a command preloads an area. The whole state is about 147 GB of GML, too much to import up front within the 200 GB budget.
- **Hamburg:** only one yearly zip (about 630 MB) is offered, so it is imported in bulk and re-imported each April.
- Buildings are stored as 2.5D (footprint, height, address, function). The downloaded GML stays in a file cache so full 3D geometry can be imported later without downloading again.

## Considered Options

- **Keep identification in the browser and only serve Footprints from the backend:** rejected; the phone would download every Footprint within 500 m and the geometry would live in two places once heights are used.
- **Import OSM buildings into PostGIS first, LoD2 later:** rejected; LoD2 already carries addresses and heights, and the existing Overpass server is enough for names.
- **Fall back to OSM Footprints outside Niedersachsen and Hamburg:** rejected for now; outside the Coverage Area the app says it has no building data.
- **Load aerial photos (DOP) from the WMS servers directly in the browser:** rejected; the backend proxies and caches them so failures show up in its log.

## Consequences

- The app now needs a running Node service and PostGIS; it is no longer static files plus a proxy. The nginx inside the image goes away; the host's nginx (with Authentik) stays in front.
- The first Snapshot in a Niedersachsen tile the backend hasn't seen yet waits for the download (about 3 MB per tile, up to 4 tiles).
- If Overpass is unavailable, Candidates are labelled with addresses only, and the failure is logged.
- LGLN data is CC BY 4.0 ("LGLN (year)"); Hamburg data is dl-de/by-2.0 ("Freie und Hansestadt Hamburg, LGV"). The app must show both credits.
