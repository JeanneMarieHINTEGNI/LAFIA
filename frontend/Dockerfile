# syntax=docker/dockerfile:1
# Lafia frontend: static Vite build served by Caddy, behind the shared edge Caddy (~/apps/edge).
# Bases pinned by digest, the same ones the server already runs (node:22-bookworm-slim, caddy v2.11.4).
FROM node@sha256:83f487e0a63425e5b4d146fb5e5be574bcbe1b7b843d3ebafdd95eaf7767a7e5 AS build
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
# Lockfile-exact install, no install scripts (npm worm defense); esbuild ships its binary as an optional dep.
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY . .
RUN npm run build

FROM caddy@sha256:5f5c8640aae01df9654968d946d8f1a56c497f1dd5c5cda4cf95ab7c14d58648
# The image grants cap_net_bind_service to the binary; with cap_drop ALL + no-new-privileges such a binary
# cannot even be exec'd. We listen on 8080, so drop the file capability instead of loosening the runtime.
RUN setcap -r /usr/bin/caddy
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
# Non-root, read-only root fs at runtime: Caddy only needs a writable /tmp (see compose.yaml).
ENV XDG_CONFIG_HOME=/tmp XDG_DATA_HOME=/tmp
USER 1000:1000
EXPOSE 8080
