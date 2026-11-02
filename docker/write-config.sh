#!/bin/sh
# Writes the app's config.js from environment variables, so one image serves any Overpass
# server. Run by nginx's entrypoint (no argument) and by the dev entrypoint (with a path).
set -eu
target="${1:-/usr/share/nginx/html/config.js}"

# Escape for a JavaScript string literal.
js_string() {
  printf '"%s"' "$(printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g')"
}

if [ -n "${OVERPASS_URL:-}" ]; then
  printf 'window.APP_CONFIG = { overpassUrl: %s };\n' "$(js_string "$OVERPASS_URL")" > "$target"
  echo "config.js: Overpass server $OVERPASS_URL"
else
  printf 'window.APP_CONFIG = {};\n' > "$target"
  echo "config.js: no OVERPASS_URL, using the public Overpass server"
fi
