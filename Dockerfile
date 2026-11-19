# The Colyseus server, for Bloxity Hosting.
#
# Built from the REPOSITORY ROOT, not from `server/`. This is an npm workspaces
# monorepo and the server imports `@race/shared` as a workspace dependency;
# a build context of `server/` alone has no `shared/` to resolve it against and
# no root lockfile to install from.
#
#   docker build -t racetrack-server .
#   docker run -e PORT=3681 -p 3681:3681 racetrack-server
#
# On Bloxity Legion the platform injects PORT (and MONGODB_URI, NODE_ENV,
# CLIENT_ORIGIN, JWT_SECRET, BLOXITY_GAME_ID, BLOXITY_CHANNEL, BLOXITY_ENV,
# BLOXITY_API_URL, POD_NAME ...); the server listens on PORT and answers
# GET /health on the same port, which is all Legion requires. Every Boxity URL
# the server uses comes from those BLOXITY_* variables, prod only as fallback
# (server/src/bloxity/environment.ts).
#
# Player progress lives in that MONGODB_URI database (one per game+channel), so
# it survives restarts, scale-to-zero and deploys; the /data volume is only the
# JSON dev store and the legacy import source. BLOXITY_GAME_ID is the HOSTING id
# (build-racetrack) and is NOT what login tokens are verified against - that is the
# portal slug (build-racetrack), a constant in shared/src/config/accounts.ts.

# ---------------------------------------------------------------- build ----
FROM node:20-alpine AS build
WORKDIR /app

# The manifests first, so a change to game code does not re-run the install.
# Every workspace's package.json is needed: npm resolves the whole tree at once
# and fails on a workspace it cannot find.
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/

# The full install, dev dependencies included - TypeScript is a devDependency
# and there is nothing to compile without it.
RUN npm ci

COPY shared/ shared/
COPY server/ server/

# Builds `shared` first and then the server, which is the order the server's
# imports require: `@race/shared` resolves to `shared/dist/index.js`.
RUN npm run build:server

# Drop to production dependencies in place. This keeps the workspace symlinks
# that `@race/shared` resolves through - deleting node_modules and
# reinstalling per-workspace would break them.
RUN npm prune --omit=dev

# -------------------------------------------------------------- runtime ----
FROM node:20-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
# The host has to be 0.0.0.0 inside a container: binding localhost would leave
# the port unreachable from outside it, which looks exactly like a crashed
# server. `PORT` is left to the host to set - Bloxity, like most managed
# hosts, injects one - and `serverConfig` falls back to 3681.
ENV HOST=0.0.0.0

# Only what running the server needs: the installed production tree and the
# two compiled outputs.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/shared/package.json ./shared/package.json
COPY --from=build /app/shared/dist ./shared/dist
COPY --from=build /app/server/package.json ./server/package.json
COPY --from=build /app/server/dist ./server/dist

# WHERE PROGRESS LIVES. On Bloxity Legion every pod is injected with
# `MONGODB_URI` - an isolated managed database per game and channel - and the
# server keeps every profile and every purchase there, one document per key.
# Progress survives restarts, scale-to-zero and deploys; nothing on the pod's
# own disk matters.
#
# /data is the JSON DEV STORE, used only when `MONGODB_URI` is unset (a
# laptop, the verification scripts). A `profiles.json` left here beside a
# Mongo deployment is imported on boot, insert-only, then ignored.
# (The server reads RACETRACK_DATA_DIR; it was COASTER_DATA_DIR, a name left over from
# the fork, so the JSON store fell back to /app/data - not writable by the node user.)
ENV RACETRACK_DATA_DIR=/data
VOLUME ["/data"]

# Not root. Nothing the server does needs it, and the base image ships a
# `node` user for exactly this.
RUN mkdir -p /data && chown -R node:node /data
USER node

EXPOSE 3681

# The same probe the health check uses, so a container that is up but not
# listening is reported as unhealthy rather than as running.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3681)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Straight to node, with no npm wrapper: npm swallows signals, so a container
# stopped by the host would not run the shutdown handler that drains the room
# and waits for the last saves to land in the database.
CMD ["node", "server/dist/index.js"]
