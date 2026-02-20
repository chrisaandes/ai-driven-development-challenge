# =============================================================================
# Refacil Wallet — Multi-stage Dockerfile
# =============================================================================
# Stages:
#   base        — installs all dependencies (cached layer)
#   development — hot-reload dev server (source mounted as volume)
#   builder     — compiles TypeScript, prunes dev deps
#   production  — minimal Alpine image, non-root user, health check
# =============================================================================

# ---- base: shared dependency install layer ----
FROM node:20-alpine AS base
WORKDIR /app

# Copy only package files first to maximise layer cache reuse.
# This layer is rebuilt only when package-lock.json changes.
COPY package*.json ./
RUN npm ci --ignore-scripts


# ---- development: hot-reload for docker-compose up ----
FROM base AS development
ENV NODE_ENV=development

# Source code is bind-mounted at runtime (see docker-compose.yml),
# so we don't COPY it here — keeps the image small and avoids stale code.
EXPOSE 3000
CMD ["npm", "run", "start:dev"]


# ---- builder: compile TypeScript and generate Prisma client ----
FROM base AS builder
WORKDIR /app

# Copy full source
COPY . .

# Generate Prisma client and compile TypeScript
RUN npx prisma generate && npm run build

# Remove dev dependencies to shrink the artifact
RUN npm prune --omit=dev


# ---- production: minimal, hardened runtime image ----
FROM node:20-alpine AS production
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000

# node user (uid 1000) ships with the official Node Alpine image.
# Running as non-root reduces attack surface.
RUN chown -R node:node /app
USER node

# Copy only what's needed to run:
#  - node_modules (prod-only, pruned by builder stage)
#  - compiled JS in dist/
#  - Prisma schema + generated client
COPY --chown=node:node --from=builder /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/dist ./dist
COPY --chown=node:node --from=builder /app/generated ./generated
COPY --chown=node:node --from=builder /app/prisma ./prisma
COPY --chown=node:node --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --chown=node:node package.json ./

EXPOSE 3000

# wget is available in Alpine and doesn't require installing curl.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "dist/main.js"]
