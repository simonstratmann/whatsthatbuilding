#!/bin/sh
# Writes nginx's proxy rule for the app's Overpass path (/api/interpreter) from OVERPASS_URL,
# so one image serves any Overpass server and the browser never talks to Overpass itself.
# Run by the nginx image's entrypoint before nginx starts; nginx.conf includes the result.
set -eu
target=/etc/nginx/overpass-proxy.conf
# Same default as dev-server/overpass-proxy.ts.
url="${OVERPASS_URL:-https://overpass-api.de/api/interpreter}"

case "$url" in
  http://*|https://*) ;;
  *) echo "OVERPASS_URL must be an http(s) URL, not '$url'" >&2; exit 1 ;;
esac
# The URL goes into nginx's config as is, so keep it to characters a URL needs.
if printf '%s' "$url" | grep -q '[^A-Za-z0-9._~:/?#@!$&()*+,=%-]'; then
  echo "OVERPASS_URL contains characters nginx can't take: '$url'" >&2
  exit 1
fi

cat > "$target" <<CONF
location = /api/interpreter {
  proxy_pass $url;
  # Send the upstream's own host name, also in TLS (SNI): Cloudflare and other shared
  # hosts need it to find the right site.
  proxy_set_header Host \$proxy_host;
  proxy_ssl_server_name on;
  # Queries run for up to 25 s on the Overpass side ([timeout:25]); leave room for the queue.
  proxy_read_timeout 90s;
}
CONF
echo "Overpass: /api/interpreter → $url"
