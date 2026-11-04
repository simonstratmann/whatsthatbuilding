# Deploying What Is That Building into an existing Compose project

Instructions for an agent updating the user's server-side `docker-compose.yml`. That file currently runs an Overpass (OSM) container plus the **old** app images: a static PWA served by nginx (`latest`, port 80 inside) and a Vite preview (`dev-latest`, port 4173 inside, with `ALLOWED_HOSTS`/`DEV_HOST`). Both are replaced by the new images described here. The reference setup is `docker-compose.yml` in this repo; read it alongside this file.

Don't touch the Overpass service, except to look up its service name and port. Show the user the finished diff before running anything that pulls images or deletes containers.

## What changed in the images

| | Old | New |
|---|---|---|
| Process | nginx (prod) / Vite preview (dev) | One Node service serving the PWA and `/api/*` |
| Port inside the container | 80 (prod), 4173 (dev) | **8080 for both** |
| Overpass | proxied for the browser at `/api/interpreter` | Only the server calls it; `/api/interpreter` no longer exists |
| Needs | nothing | **PostGIS**, plus two cache folders |
| Dev-only settings | `ALLOWED_HOSTS` / `DEV_HOST` | gone; remove them |

Images: `ghcr.io/simonstratmann/whatsthatbuilding:latest` (production, no request log) and `:dev-latest` (writes a request log to `/app/logs`). Both run as uid 1000 (`node`).

## Steps

1. **Add a PostGIS service** (the image includes PostGIS 3.5):
   ```yaml
   postgis:
     image: postgis/postgis:17-3.5
     restart: unless-stopped
     environment:
       POSTGRES_USER: building
       POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?set POSTGRES_PASSWORD}
       POSTGRES_DB: building
     volumes:
       - postgis-data:/var/lib/postgresql/data
     healthcheck:
       test: ["CMD-SHELL", "pg_isready -U building -d building"]
       interval: 5s
       timeout: 5s
       retries: 20
   ```
   Don't publish its port. Ask the user for a long random `POSTGRES_PASSWORD` and put it in the `.env` file next to the Compose file, which must not be committed. If a `postgis` service already exists for something else, rename this one (e.g. `building-postgis`) and change `DATABASE_URL` to match.

2. **Replace the two app services** with:
   ```yaml
   x-building-environment: &building-environment
     DATABASE_URL: postgres://building:${POSTGRES_PASSWORD:?set POSTGRES_PASSWORD}@postgis:5432/building
     # The Overpass service in this project, by service name and its internal port.
     OVERPASS_URL: http://<overpass-service>:<port>/api/interpreter

   services:
     app:
       image: ghcr.io/simonstratmann/whatsthatbuilding:latest
       restart: unless-stopped
       depends_on:
         postgis:
           condition: service_healthy
       ports:
         - "127.0.0.1:8080:8080"
       environment: *building-environment
       volumes:
         - lod2-cache:/app/cache          # downloaded LoD2 GML (Hamburg alone is about 7 GB)
         - dop-cache:/app/dop-cache       # Aerial Photo tiles, up to 20 GB

     app-dev:
       image: ghcr.io/simonstratmann/whatsthatbuilding:dev-latest
       restart: unless-stopped
       depends_on:
         postgis:
           condition: service_healthy
       ports:
         - "127.0.0.1:4173:8080"          # note: 8080 inside now, not 4173
       environment: *building-environment
       volumes:
         - lod2-cache:/app/cache          # shared with app: building data is downloaded once
         - dop-cache-dev:/app/dop-cache   # its own: each app tracks the size of its own cache
         - ./logs:/app/logs               # request log; must be writable by uid 1000

   volumes:
     postgis-data:
     lod2-cache:
     dop-cache:
     dop-cache-dev:
   ```
   - Find the Overpass service's name and internal port (the port its HTTP server listens on inside the container, not a published one) in the existing file. Check that it answers at `/api/interpreter`. Both app containers must share a Compose network with it, and they do by default in the same project.
   - Keep the host-side ports the user already uses if they differ from 8080/4173; only the container side (`:8080`) must change.
   - Optional: `DOP_CACHE_MAX_GB` (default 20) on either service. The disk budget for everything is about 200 GB.
   - If `./logs` already exists from the old dev image, it is compatible. Otherwise create it and `chown 1000:1000 logs`.

3. **Reverse proxy (the host's nginx, behind Authentik).** The site config keeps forwarding to the same host ports. Add one thing: a first Snapshot in a part of Niedersachsen the app hasn't seen yet waits for building data to download, which can take longer than nginx's default 60 s. For the `/api/` location, or the whole site, set:
   ```nginx
   proxy_read_timeout 180s;
   ```
   Remove any `/api/interpreter` special-casing left from the old setup. Reload nginx (`nginx -t && systemctl reload nginx`, or however the host runs it).

4. **Start:** `docker compose pull app app-dev postgis && docker compose up -d`. The apps create their database schema on first start. Check `docker compose logs app app-dev` for `Serving … and the API on http://localhost:8080`.

5. **Import Hamburg's building model once.** This is a 650 MB download that takes a few minutes and keeps 7 GB of GML in `lod2-cache`. Without it, every Snapshot in Hamburg gets "No building data here":
   ```sh
   docker compose run --rm app node server/src/import-hamburg.ts
   ```
   Run it again each April, when Hamburg publishes a new release.

6. **Optional: preload a home area in Niedersachsen** (WGS84: west south east north), e.g. Hannover:
   ```sh
   docker compose run --rm app node server/src/preload-niedersachsen.ts 9.65 52.32 9.85 52.43
   ```

## Checking it works

Run these from the server against the host ports, which skips Authentik:

```sh
# Identification in Hamburg (Rathausmarkt, facing north): expect 200 and Candidates.
curl -s -X POST localhost:8080/api/identify -H 'Content-Type: application/json' \
  -d '{"mode":"dev","snapshot":{"position":{"lat":53.5503,"lon":9.9925},"heading":0,"accuracyMetres":5,"compassCalibration":"calibrated"}}' | head -c 400

# An Aerial Photo tile in Hamburg and one in Hannover: expect 200 image/jpeg, the second call much faster.
curl -s -o /dev/null -w '%{http_code} %{content_type} %{time_total}s\n' localhost:8080/api/dop/17/69174/42361
curl -s -o /dev/null -w '%{http_code} %{content_type} %{time_total}s\n' localhost:8080/api/dop/17/69081/43072
curl -s -o /dev/null -w '%{http_code} %{content_type} %{time_total}s\n' localhost:8080/api/dop/17/69081/43072
```

Repeat with port 4173 for the dev image. After that request, `logs/requests.log` should have a line for it.

Typical failures:
- **`outside-coverage-area` warning in Hamburg:** the import (step 5) hasn't run.
- **No names, only addresses:** `OVERPASS_URL` is wrong or unreachable. The app logs `[labels] … no names from OpenStreetMap`.
- **`EACCES` on `/app/logs`:** `./logs` isn't writable by uid 1000.
- **502 from the host's nginx on the first Snapshot in a new area:** `proxy_read_timeout` is still at its default.
- **App restarts with `DATABASE_URL must name …`:** the variable isn't reaching the container. Check `.env`.

Report back to the user with the final diff, the output of the checks, and anything you couldn't verify.
