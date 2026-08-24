# A container for the frontend, so "how do I run this" has an answer that does
# not start with "install node".
#
# Multi-stage: the build stage keeps dev dependencies out of the image that ships.
# Nothing about the CMS lives in here — the container talks to a Paperboy over
# HTTP, so the same image runs against local, staging and production by changing
# environment variables.

FROM node:24-alpine AS build
WORKDIR /app

# Dependencies first, so a source-only change reuses the install layer.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# No CMS values needed here: this app reads its configuration per REQUEST, not
# at build time, precisely so one image can serve any environment.
RUN npm run build

FROM node:24-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4321

# ~530MB, of which ~230MB is this install. The built server itself only imports a
# handful of small packages, but Astro is a runtime dependency and npm brings its
# whole tree (sharp, esbuild, rolldown, shiki) along. Trimming that means either
# hand-listing Astro's internals — which breaks on every Astro upgrade — or
# vendoring the runtime deps. Neither is worth it for a starter, so the size is
# deliberate rather than overlooked.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist

# Unprivileged: the node image ships a `node` user for exactly this.
USER node
EXPOSE 4321

# A container that reports healthy while serving 503 "not configured" would hide
# a broken deploy — the starter answers 503 until its keys are present, so this
# check follows that.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4321)+'/').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"

CMD ["node", "./dist/server/entry.mjs"]
