#!/bin/sh
set -eu
# Plain HTTP behind the reverse proxy that terminates SSL; list the host name the proxy
# forwards in ALLOWED_HOSTS, or Vite refuses the request. Vite forwards /api/interpreter
# to OVERPASS_URL (see web/vite.config.ts).
cd /app/web
exec npx vite preview --host 0.0.0.0 --port 4173 --strictPort
