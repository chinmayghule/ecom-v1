# Local Development — Phase 1

How to run the Phase 1 API and PostgreSQL locally, apply the committed
migration, run the tests, and use the one-command gate. All values below are
local placeholders; no real secret belongs in the repository.

## Prerequisites (exact versions)

| Tool | Exact version | Provisioned by |
|------|---------------|----------------|
| Node.js | 24.22.2 | `.nvmrc`, root `engines`, Docker images |
| pnpm | 11.5.2 | Corepack 0.36.0 via root `packageManager` — never a floating range or a global install |
| Corepack | 0.36.0 | Node 24 toolchain |
| Docker + Compose | Compose v2 | Required for the Compose runtime path; `docker compose config` works without a daemon |
| PostgreSQL | `postgres:17-alpine` | Compose service, or a local `initdb`/`pg_ctl` cluster plus `psql` when no daemon is available |

Before installing anything, read [`DEPENDENCIES.md`](../../DEPENDENCIES.md):
every direct dependency is pinned there and the Vitest 5.1.0 install was gated on
an explicit owner verdict. Do not add or substitute a package outside that
inventory. Install strictly from the committed lockfile:

```bash
corepack enable
corepack prepare pnpm@11.5.2 --activate
test "$(pnpm --version)" = '11.5.2'
pnpm install --frozen-lockfile
```

`pnpm-workspace.yaml` sets `ignoreScripts: true` (supply-chain policy). Because
dependency install scripts do not run, the Prisma client is generated explicitly
by the gate (`pnpm --filter @ecom-v1/api db:generate`); a fresh clone builds
correctly once the gate has run that step.

## Environment files

- `apps/api/.env.example` — the committed template of **non-secret** local
  placeholders (never real credentials).
- `.env` / `.env.*` — gitignored local overrides. Create one only if you need to
  change a local value; keep real Clerk keys out of git.
- Compose injects non-secret defaults for `CLERK_SECRET_KEY`, `CLERK_JWT_KEY`,
  `CLERK_WEB_ORIGIN`, `ADMIN_EMAILS` and `TOMBSTONE_SECRET`. All are local
  placeholders. Real Clerk credentials are only needed for the manual live
  instance check and the Phase 5 browser journeys, never for the test suite.

Required env names are validated at boot by `apps/api/src/common/config/env.validation.ts`.

## Database and test commands

All commands run from the repository root.

```bash
# Generate the Prisma client after a fresh install (install scripts are disabled).
pnpm --filter @ecom-v1/api db:generate

# Apply the single committed Plan 04 migration entrypoint to a target database.
DIRECT_URL='postgresql://...' pnpm --filter @ecom-v1/api db:deploy

# Disposable-database proof: empty DB -> migrate deploy -> reset -> re-apply ->
# real constraint suite -> teardown. Uses Docker when the daemon is reachable,
# otherwise a local initdb/pg_ctl cluster. Never touches a developer database.
pnpm --filter @ecom-v1/api db:test

# Full unit/integration/API suite (each real-DB spec gets its own disposable DB).
pnpm --filter @ecom-v1/api test
```

## The one-command gate (same as CI)

```bash
pnpm run verify:phase-01
```

`scripts/verify-phase-01.sh` runs, in order: the Vite+ check (lint), strict API
TypeScript typecheck, Prisma client generation, API build, `db:deploy` against a
fresh disposable database, `db:test` (apply/reset/re-apply plus constraints), the
full test suite, and the Compose configuration check. It also runs
`docker compose build api` when a Docker daemon is reachable and prints an
explicit skip otherwise — no Compose runtime pass is claimed without a daemon.
`.github/workflows/ci.yml` calls the same command on every push and pull request.

## Compose startup and readiness

```bash
docker compose config --quiet
docker compose build api
docker compose up -d --wait --wait-timeout 180
```

Compose gates the API on the PostgreSQL **healthcheck** (`pg_isready`), and the
API applies `db:deploy` before serving. There are no sleeps. Verify readiness on
the real endpoints:

```bash
curl -fsS http://127.0.0.1:3000/health/live    # process liveness
curl -fsS http://127.0.0.1:3000/health/ready   # 200 only when PostgreSQL is reachable
curl -fsS http://127.0.0.1:3000/api/docs        # single OpenAPI baseline
```

Readiness runs a bounded real Prisma query and returns 503 `SERVICE_UNAVAILABLE`
on rejection, timeout or a malformed result — it never returns a constant 200.

## Shutdown and cleanup

```bash
docker compose down          # stop the stack; keep the named pgdata volume
docker compose down -v       # stop and remove the local database volume
```

The verification script and the test harness tear down their own temporary
clusters and temporary directories on exit. Nothing writes to a developer's
populated database.

## Troubleshooting (no secrets)

- **"Cannot connect to the Docker daemon"** — the Compose *configuration* check
  still works (`docker compose config --quiet`); builds/up need a running daemon.
  The test gate falls back to a local `initdb`/`pg_ctl` cluster automatically.
- **`PrismaClient has no exported member`** — run `pnpm --filter @ecom-v1/api
  db:generate`; a fresh install with scripts disabled has no generated client.
- **Boot fails on env validation** — compare your local override with
  `apps/api/.env.example`; use placeholder values, never paste a real key into
  the terminal, an issue, or the verification document.
- **Port conflict** — the disposable harness picks a free port automatically;
  for Compose, stop any other process on 5432/3000 before `up`.
- **Readiness 503** — check the PostgreSQL container is healthy; readiness
  reflects real dependency state and intentionally fails closed.

The live Clerk dashboard check and the browser sign-up/sign-in/sign-out journeys
are **not** local CLI checks; see `docs/verification/phase-01-verification.md`.
