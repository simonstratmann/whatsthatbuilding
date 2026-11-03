# Proxy Overpass through the app's own host

The browser sends its Overpass queries to `/api/interpreter` on the host that serves the app, and that host forwards them to the Overpass server named by `OVERPASS_URL` (nginx in the production image, Vite's proxy in the dev image and local dev). Identification still runs in the browser; only the transport moved. The Overpass server then needs no public hostname, HTTPS or CORS headers, so a self-hosted instance can sit next to the app on an internal network (`http://overpass:8080/api/interpreter` in the same Compose project), and it no longer sees each user's IP address.

Before this, the browser called Overpass directly and learned its URL from a `config.js` written at start-up. Internal addresses and URLs without the `/api/interpreter` path then failed in the browser as an opaque "NetworkError", which is hard to diagnose from a phone.

## Considered Options

- **Browser calls Overpass directly** (the earlier setup): rejected for the reasons above.
- **A backend that runs the identification** (phone sends the Snapshot, server returns Candidates): rejected for now; it adds a service and an API without a need for server-side logic or caching yet.

## Consequences

- Every user's queries reach Overpass from the app server's IP, so the public server's per-IP rate limit is shared by all users. Fine for testing; a real deployment should use its own Overpass server.
- nginx resolves the Overpass host name when it starts, so the production container fails to start (and is restarted by Compose) while that host can't be resolved.
