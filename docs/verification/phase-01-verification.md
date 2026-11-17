# Phase 1 Verification Evidence

This record contains only commands that were actually executed in this
environment, with their observed outcomes. No browser journey, live Clerk
dashboard check, or Docker/Compose runtime result is claimed as a Phase 1 pass.
Where the environment could not run a check, the limitation is stated plainly.

- **Environment:** Linux; Node 24.22.2, pnpm 11.5.2, Corepack 0.36.0 (verified
  with `--version`). Docker CLI 29.9.3 and Compose v2.36.0-desktop.1 are
  installed, **but no Docker daemon is reachable** (`docker info` fails with
  `Cannot connect to the Docker daemon at unix:///var/run/docker.sock`).
- **Database fallback:** all real-PostgreSQL checks used the supported local
  `initdb`/`pg_ctl` + `psql` cluster (binaries present at `/usr/bin`), the same
  fallback used by Plans 01-04, 01-05, 01-06, 01-07 and 01-08. No Docker-based
  runtime pass is claimed.

## Automated results (commands actually run)

| # | Command | Timestamp (UTC) | Result |
|---|---------|-----------------|--------|
| 1 | `node --version`, `pnpm --version`, `corepack --version` | 2026-11-17T08:14:42Z | PASS — v24.22.2 / 11.5.2 / 0.36.0, exact pins |
| 2 | `pnpm --filter @ecom-v1/api test` (pre-change baseline) | 2026-11-17T08:15Z | PASS — 17 files, 99 tests, 0 skipped |
| 3 | `docker compose config --quiet` | 2026-11-17T08:14Z | PASS (exit 0) — configuration resolves |
| 4 | `pnpm run check` (before formatter config) | 2026-11-17T08:20Z | FAIL — 101 files had pre-existing Oxfmt differences; recorded in `deferred-items.md`, not reformatted |
| 5 | `pnpm run check` (after formatter config) | 2026-11-17T08:23Z | PASS — 0 errors, 3 warnings (unused imports); typecheck enforced explicitly in the gate |
| 6 | `bash -n scripts/verify-phase-01.sh` | 2026-11-17T08:24Z | PASS (syntax valid) |
| 7 | Acceptance suite GREEN: `pnpm --filter @ecom-v1/api test -- src/test/phase-01-acceptance.e2e-spec.ts` | 2026-11-17T08:24Z | PASS — 18 files, 110 tests, 0 skipped (11 acceptance cases) |
| 8 | `pnpm run verify:phase-01` in the working tree | 2026-11-17T08:25Z | PASS — lint, typecheck, Prisma generate, build, `db:deploy`, `db:test`, 18/110 suite, Compose config; Compose build skipped (no daemon) |
| 9 | Clean snapshot: `git archive HEAD \| tar -x -C "$SNAP"` into `/tmp/opencode/ecom-v1-snapshot-*` | 2026-11-17T08:26:58Z | PASS — committed snapshot contained CI workflow, verify script and full source |
| 10 | Clean snapshot: `pnpm install --frozen-lockfile` | 2026-11-17T08:27Z | PASS — lockfile up to date, 472 packages installed, exit 0 |
| 11 | Clean snapshot: `pnpm run verify:phase-01` | 2026-11-17T08:26:58Z–08:27:44Z | PASS — lint/typecheck/build, `db:deploy` on an empty disposable DB (8 tables), `db:test` apply→reset→re-apply (8 tables) + 6 constraint tests, full suite 18 files / 110 tests, `docker compose config --quiet`; exit 0 |
| 12 | `docker compose build api` | 2026-11-17T08:28Z | BLOCKED — `Cannot connect to the Docker daemon at unix:///var/run/docker.sock`. No Compose image build or `up --wait` pass is claimed. |
| 13 | `graphify update . --no-viz` | 2026-11-17T08:28Z | PASS — AST-only rebuild: 228 nodes, 215 edges, 47 communities; `graphify-out/` remains gitignored and uncommitted |

### TDD gate evidence (Task 2)

| Phase | Command | Result |
|-------|---------|--------|
| RED | acceptance suite before the journey doc existed | FAIL (expected) — 1 failure, `ENOENT` for `docs/architecture/phase-01-journeys.md`; 109 other tests passed |
| GREEN | same command after adding the journey doc | PASS — 18 files / 110 tests |

Git log ordering verified: `test(01-09)` (`f76974a`) precedes `feat(01-09)`
(`d02eba3`), which is preceded by `feat(01-09)` CI (`d193c44`) and followed by
`fix(01-09)` clean-snapshot reproducibility (`470717d`).

### Database and Compose evidence

- `db:deploy` ran against an **empty, freshly provisioned** disposable database
  in both the working-tree and clean-snapshot gates; each apply produced exactly
  8 base tables (7 domain tables + Prisma's `_prisma_migrations` ledger).
- `db:test` independently provisioned another disposable database, applied the
  committed migration, dropped/reset the schema (0 tables), re-applied it (8
  tables), ran the 6 real-PostgreSQL constraint tests, and tore the cluster down.
- The full suite's real-DB specs each provisioned their own disposable cluster
  when `TEST_DATABASE_URL` was not supplied, so no developer database was reused.
- `docker compose config --quiet` passed; `docker compose build api` and
  `docker compose up -d --wait --wait-timeout 180` could **not** run because the
  Docker daemon is unavailable. Compose health-gated startup and the container
  readiness check remain unverified at runtime here.

## Manual-only checks (not Phase 1 passes)

The following are listed as manual-only in
[`.planning/phases/01-platform-foundation-identity/01-VALIDATION.md`](../../.planning/phases/01-platform-foundation-identity/01-VALIDATION.md).
They are recorded here with their true status — none is a browser-verified or
automated Phase 1 pass.

| Check | Requirement | Status | Why it is not an automated Phase 1 pass |
|-------|-------------|--------|------------------------------------------|
| Live Clerk instance matches the documented configuration (required email + one custom display-name field, email verification enabled, three signed session claims present, authorized party matching the API allowlist); decode one test session token | AUTH-01, AUTH-02, AUTH-05 | **MANUAL — OUTSTANDING (configuration contract)** | Needs the owner's Clerk dashboard and a live session token; no repository CLI can assert dashboard state. Procedure is in `docs/identity/clerk-integration.md` → `Live Clerk verification procedure`. |
| Browser sign-up, sign-in, session persistence across browser sessions, and sign-out | AUTH-01, AUTH-02, AUTH-03 | **PHASE 5 DELIVERABLE — NOT RUN** | Phase 1 ships no browser UI; the Clerk UI is wired in Phase 5. Phase 1 proves only the API token/claims contract. Tracked in `docs/architecture/phase-01-journeys.md` → `Phase 5 handoff`. |
| Merchant-obligation deletion policy, tombstone/retention rule, Clerk revocation sequence | AUTH-06 | **OWNER DECISIONS ALREADY RECORDED** (Plan 01-03, `.planning/PROJECT.md`) | Consequential product/privacy decisions, not a CLI verification. Their implementation is proven by automated API/integration tests above. |

## Unresolved items

- No Docker daemon: Compose image build, `up --wait`, and container health/readiness
  were not executed. The local `initdb`/`pg_ctl` fallback was used and is reported
  above; treat the Compose runtime path as **unverified here**, not failed and not
  passed.
- Live Clerk dashboard configuration and the browser journeys remain manual/Phase 5
  as stated above.
- Pre-existing Vite+ format-check debt is recorded in
  `.planning/phases/01-platform-foundation-identity/deferred-items.md`; the format
  step is disabled in the enforced gate and is not claimed as passing.
