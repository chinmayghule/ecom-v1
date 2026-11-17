# syntax=docker/dockerfile:1

# Runtime and package-manager pins must match .nvmrc / packageManager exactly.
FROM node:24.22.2-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.5.2 --activate

# --- Dependency install + generated Prisma client ---------------------------
# Dependency lifecycle scripts are disabled repo-wide (pnpm-workspace.yaml),
# so the client must be generated explicitly with the pinned CLI.
FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json vite.config.ts ./
COPY apps/api/package.json apps/api/tsconfig.json apps/api/tsconfig.build.json \
     apps/api/nest-cli.json apps/api/prisma7.config.ts ./apps/api/
COPY apps/api/prisma ./apps/api/prisma
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @ecom-v1/api db:generate

# --- Framework-native build -------------------------------------------------
FROM deps AS build
COPY apps/api/src ./apps/api/src
RUN pnpm --filter @ecom-v1/api build

# --- Production runtime -----------------------------------------------------
# Dev dependencies are pruned; the pinned Prisma CLI remains a runtime
# dependency because the container applies migrations via the single Plan 04
# db:deploy entrypoint before it starts serving.
FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app /app
# Use a production-only install rather than `pnpm prune --prod`: prune drops
# the workspace .bin links (so `prisma` disappears for the db:deploy CMD).
# An offline prod install prunes devDependencies AND recreates the bin links.
# CI=true is required for non-interactive module purging in Docker builds.
RUN CI=true pnpm install --prod --frozen-lockfile --offline
USER node
EXPOSE 3000
# Migration-before-serving with no sleep: Compose gates DB readiness first.
CMD ["sh", "-c", "pnpm --filter @ecom-v1/api db:deploy && pnpm --filter @ecom-v1/api start:prod"]
