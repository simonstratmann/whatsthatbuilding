# Both serve plain HTTP; put them behind a reverse proxy that terminates SSL.
# Two images from one Dockerfile:
#   --target production  → static build served by nginx              (tag: latest)
#   --target dev         → build with request logging, Vite preview   (tag: dev-latest)
# Both forward the app's Overpass queries (/api/interpreter) to OVERPASS_URL, read at start-up.

FROM node:24-alpine AS source
WORKDIR /app
COPY package.json package-lock.json ./
COPY web/package.json web/
COPY server/package.json server/
COPY shared/package.json shared/
RUN npm ci
COPY . .

FROM source AS production-build
RUN npm run build

FROM nginx:1.29-alpine AS production
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
# The nginx image runs every script in /docker-entrypoint.d/ before starting.
COPY docker/write-overpass-proxy.sh /docker-entrypoint.d/40-write-overpass-proxy.sh
COPY --from=production-build /app/web/dist /usr/share/nginx/html
EXPOSE 80

FROM source AS dev
# The node user needs to write the logs and the temporary copy of the Vite config that Vite
# writes to node_modules/.vite-temp on start-up.
RUN VITE_REQUEST_LOG=true npm run build -w web \
 && mkdir -p logs web/node_modules/.vite-temp \
 && chown -R node:node logs web/node_modules/.vite-temp
USER node
EXPOSE 4173
# Request logs: requests.log and requests/<id>.json.
VOLUME /app/logs
ENTRYPOINT ["/app/docker/dev-entrypoint.sh"]
