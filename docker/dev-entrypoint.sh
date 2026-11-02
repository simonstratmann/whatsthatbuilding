#!/bin/sh
set -eu
/app/docker/write-config.sh /app/dist/config.js
# Plain HTTP behind the reverse proxy that terminates SSL; list the host name the proxy
# forwards in ALLOWED_HOSTS, or Vite refuses the request.
exec npx vite preview --host 0.0.0.0 --port 4173 --strictPort
