#!/usr/bin/env bash
# Local, deterministic equivalent of the Phase 1 GitHub Actions gate.
#
# Runs the same lint/typecheck, API build, single Plan 04 migration entrypoints,
# full unit/integration/API suite and Compose configuration check as CI. A
# fresh disposable PostgreSQL database is created for `db:deploy`; a developer's
# populated database is never reused. `db:test` provisions its own disposable
# database and applies/reset/re-applies the committed migration itself.
#
# No real credentials are accepted or printed. All env values below are
# non-secret local placeholders; real Clerk credentials belong in a gitignored
# .env override and are only needed for the manual browser journeys (Phase 5).
#
# Docker is used when its daemon is reachable; otherwise the supported local
# initdb/pg_ctl fallback (same as Plans 01-04/01-05/01-08) is used. The Docker
# daemon availability is reported honestly; no Compose runtime pass is claimed
# when only the configuration check could run.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

log() { printf '%s\n' "$*"; }
die() { printf 'FATAL: %s\n' "$*" >&2; exit 1; }

# Non-secret deterministic placeholders. Never echo these values.
export NODE_ENV=test
export CLERK_SECRET_KEY=sk_test_placeholder
export CLERK_JWT_KEY=jwt_test_placeholder
export CLERK_WEB_ORIGIN=http://localhost:3000
export CLERK_ISSUER=https://clerk.example.test
export CLERK_AUDIENCE=clerk.example.test
export ADMIN_EMAILS=owner@example.test
export TOMBSTONE_SECRET=local_verify_tombstone_secret

log '==> [1/6] Vite+ check (lint; strict TS typecheck is an explicit API gate step)'
pnpm run check

# ---- disposable PostgreSQL for the single db:deploy entrypoint -------------
BASE_TMP="${TMPDIR:-/tmp/opencode}"
mkdir -p "$BASE_TMP"
WORK_DIR="$(mktemp -d "${BASE_TMP}/ecom-v1-verify-XXXXXX")"
DB_NAME=ecom_verify
PORT="$(node -e 'const n=require("net");const s=n.createServer();s.listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close();});')"
DB_URL="postgresql://postgres@127.0.0.1:${PORT}/${DB_NAME}"
CONTAINER="ecom-v1-verify-$$"
MODE=local

cleanup() {
  if [[ "$MODE" == "docker" ]]; then
    docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  elif [[ -d "$WORK_DIR/data" ]]; then
    pg_ctl -D "$WORK_DIR/data" -m fast -w stop >/dev/null 2>&1 || true
  fi
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

log "==> [2/6] Provisioning disposable PostgreSQL on port ${PORT} for db:deploy"
if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  MODE=docker
  docker run -d --rm --name "$CONTAINER" \
    -e POSTGRES_HOST_AUTH_METHOD=trust \
    -e POSTGRES_DB="$DB_NAME" \
    -p "${PORT}:5432" \
    postgres:17-alpine >/dev/null
else
  log '    Docker daemon unavailable; using local initdb/pg_ctl fallback'
  initdb -D "$WORK_DIR/data" --no-locale --encoding=UTF8 --auth=trust -U postgres >/dev/null
  pg_ctl -D "$WORK_DIR/data" \
    -o "-p ${PORT} -k ${WORK_DIR} -c listen_addresses=127.0.0.1" \
    -l "$WORK_DIR/postgres.log" -w start >/dev/null
  psql --no-psqlrc -q -h 127.0.0.1 -p "$PORT" -U postgres -d postgres \
    -c "CREATE DATABASE ${DB_NAME};" >/dev/null
fi

# Bounded readiness poll on the real condition (not a fixed sleep).
ready=0
for _ in $(seq 1 60); do
  if psql --no-psqlrc -q "$DB_URL" -Atc 'SELECT 1' >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 0.5
done
[[ "$ready" == "1" ]] || die "disposable database did not become ready"

DATABASE_URL="$DB_URL" DIRECT_URL="$DB_URL" \
  pnpm --filter @ecom-v1/api db:deploy

log '==> [3/6] Releasing the disposable db:deploy database'
cleanup
trap - EXIT

log '==> [4/6] API bundle: prisma generate + typecheck + build + db:test (apply/reset/re-apply) + full suite'
pnpm --filter @ecom-v1/api verify

log '==> [5/6] Compose configuration check'
docker compose config --quiet

log '==> [6/6] Compose build check'
if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  docker compose build api
else
  log 'SKIP: docker compose build api — Docker daemon unavailable here; configuration validated above. No Compose runtime pass is claimed.'
fi

log '==> Phase 1 local gate PASSED'
