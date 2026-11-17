#!/usr/bin/env bash
# Disposable-database verification for the committed foundation migration.
#
# Called by `pnpm --filter @ecom-v1/api db:test`. It provisions an empty
# PostgreSQL database, applies the committed migration with `prisma migrate
# deploy` against DIRECT_URL, proves revert applicability (apply -> drop/reset
# -> re-apply, because Prisma generates no down migration), runs the real
# database constraint suite, and tears everything down.
#
# Docker is used when its daemon is reachable (CI/local Compose). Otherwise a
# local PostgreSQL cluster is started with initdb/pg_ctl, so the same script is
# runnable in environments without a Docker daemon.

set -euo pipefail

API_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$API_DIR"

MIGRATION_REL="prisma/migrations/0001_identity_foundation/migration.sql"
if [[ ! -f "$MIGRATION_REL" ]]; then
  echo "FATAL: committed migration is missing: $MIGRATION_REL" >&2
  exit 1
fi

WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/ecom-v1-migtest-XXXXXX")"
DB_NAME="ecom_migtest"
PORT="$(node -e 'const n=require("net");const s=n.createServer();s.listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close();});')"
DB_URL="postgresql://postgres@127.0.0.1:${PORT}/${DB_NAME}"
CONTAINER="ecom-v1-migtest-$$"
MODE="local"

cleanup() {
  if [[ "$MODE" == "docker" ]]; then
    docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  elif [[ -d "$WORK_DIR/data" ]]; then
    pg_ctl -D "$WORK_DIR/data" -m fast -w stop >/dev/null 2>&1 || true
  fi
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

echo "==> Provisioning disposable PostgreSQL (port $PORT)"
if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  MODE="docker"
  docker run -d --rm --name "$CONTAINER" \
    -e POSTGRES_HOST_AUTH_METHOD=trust \
    -e POSTGRES_DB="$DB_NAME" \
    -p "${PORT}:5432" \
    postgres:17-alpine >/dev/null
else
  echo "    Docker daemon unavailable; using local initdb/pg_ctl"
  initdb -D "$WORK_DIR/data" --no-locale --encoding=UTF8 --auth=trust -U postgres >/dev/null
  pg_ctl -D "$WORK_DIR/data" \
    -o "-p ${PORT} -k ${WORK_DIR} -c listen_addresses=127.0.0.1" \
    -l "$WORK_DIR/postgres.log" -w start >/dev/null
  psql --no-psqlrc -q -h 127.0.0.1 -p "$PORT" -U postgres -d postgres \
    -c "CREATE DATABASE ${DB_NAME};" >/dev/null
fi

for _ in $(seq 1 60); do
  if psql --no-psqlrc -q "$DB_URL" -Atc 'SELECT 1' >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
done
psql --no-psqlrc -q "$DB_URL" -Atc 'SELECT 1' >/dev/null 2>&1 || {
  echo "FATAL: disposable database did not become ready" >&2
  exit 1
}

# 7 domain tables + Prisma's _prisma_migrations ledger.
EXPECTED_TABLES=8
count_tables() {
  psql --no-psqlrc -q "$DB_URL" -Atc \
    "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';"
}

echo "==> Apply 1: prisma migrate deploy on the empty database"
DIRECT_URL="$DB_URL" ./node_modules/.bin/prisma migrate deploy
TABLES="$(count_tables)"
[[ "$TABLES" == "$EXPECTED_TABLES" ]] || {
  echo "FATAL: expected $EXPECTED_TABLES tables after apply, found $TABLES" >&2
  exit 1
}
echo "    applied cleanly ($TABLES tables)"

echo "==> Revert applicability: drop schema/history, then re-apply"
psql --no-psqlrc -q "$DB_URL" -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;' >/dev/null
AFTER_DROP="$(count_tables)"
[[ "$AFTER_DROP" == "0" ]] || {
  echo "FATAL: expected 0 tables after reset, found $AFTER_DROP" >&2
  exit 1
}
DIRECT_URL="$DB_URL" ./node_modules/.bin/prisma migrate deploy
TABLES="$(count_tables)"
[[ "$TABLES" == "$EXPECTED_TABLES" ]] || {
  echo "FATAL: expected $EXPECTED_TABLES tables after re-apply, found $TABLES" >&2
  exit 1
}
echo "    re-applied cleanly ($TABLES tables)"

echo "==> Constraint suite against the migrated database"
# Target the single migration-contract spec with vitest directly. The Vite+
# `pnpm test -- <path>` wrapper does not filter files and would launch every
# suite in parallel against this shared disposable database, letting the
# real-DB e2e TRUNCATE fixtures clobber one another (a 01-09 gate blocker).
TEST_DATABASE_URL="$DB_URL" ./node_modules/.bin/vitest run src/common/database/schema.spec.ts

echo "==> Migration verification PASSED"
