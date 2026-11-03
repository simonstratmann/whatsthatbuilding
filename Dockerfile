# Both serve plain HTTP on port 8080; put them behind a reverse proxy that terminates SSL.
# Two images from one Dockerfile, each a single Node service serving the PWA and its API:
#   --target production  → no request log                                   (tag: latest)
#   --target dev         → keeps every request in /app/logs (REQUEST_LOG_DIR) (tag: dev-latest)
# The server asks the Overpass server named by OVERPASS_URL, read at start-up.

FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY web/package.json web/
COPY server/package.json server/
COPY shared/package.json shared/
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-alpine AS production
WORKDIR /app
COPY package.json package-lock.json ./
COPY web/package.json web/
COPY server/package.json server/
COPY shared/package.json shared/
# Only the server's runtime dependencies; Node runs its TypeScript as is.
RUN npm ci --omit=dev -w server -w shared && npm cache clean --force
COPY shared/src shared/src
COPY server/src server/src
COPY --from=build /app/web/dist web/dist
ENV NODE_ENV=production PORT=8080
USER node
EXPOSE 8080
CMD ["node", "server/src/main.ts"]

FROM production AS dev
USER root
RUN mkdir -p logs && chown node:node logs
USER node
# Request logs: requests.log and requests/<id>.json.
ENV REQUEST_LOG_DIR=/app/logs
VOLUME /app/logs
