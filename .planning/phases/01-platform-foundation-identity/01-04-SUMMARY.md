---
phase: 01-platform-foundation-identity
plan: 04
subsystem: database
tags: [prisma, postgresql, migrations, driver-adapter, pg-pool, identity-lifecycle, staged-closure, tombstone, env-validation]

# Dependency graph
requires:
  - phase: 01-02
    provides: "Pinned pnpm/Node/NestJS 12 workspace, strict TypeScript 6 config and the single Vitest test layout"
  - phase: 01-03
    provides: "Owner resolutions for staged closure and keyed-permanent-tombstone-local-first, binding this schema"
provides:
  - "Versioned identity foundation migration on PostgreSQL with database-enforced uniqueness and ON DELETE RESTRICT retention"
  - "One Nest-managed Prisma 7.10.1 client using the pooled runtime URL and a bounded pg adapter pool"
  - "Single db:generate / db:deploy / db:test provisioning and migration entrypoint for Compose and CI to reuse"
  - "Schema capacity for the later ~200 curated gallery seed with no gallery module behaviour"
affects:
  - "Plan 01-05 (Compose calls db:deploy), 01-06/01-07 (tombstone + local user queries), 01-08 (transactional anonymization/closure), 01-09 (CI calls db:test)"

# Tech tracking
tech-stack:
  added:
    - "Prisma schema + first reviewed SQL migration (0001_identity_foundation), pinned to Prisma CLI/client/adapter 7.10.1"
    - "prisma7.config.ts CLI config (auto-discovered filename), DIRECT_URL for migrations / DATABASE_URL for runtime"
    - "env.validation.ts typed boundary with sanitized ConfigurationError; @prisma/adapter-pg with explicit pg pool max/timeout"
  patterns:
    - "Migration invariants live in the database (unique indexes, ON DELETE RESTRICT, append-only trigger), not in application checks"
    - "Migrations are reviewed, versioned and immutable; Prisma has no down migration, so revert applicability is proven by apply -> drop -> re-apply"
    - "One database client and one provisioning entrypoint; no BaseRepository and no second ORM/client"
key-files:
  created:
    - apps/api/prisma/schema.prisma
    - apps/api/prisma/migrations/0001_identity_foundation/migration.sql
    - apps/api/scripts/test-migrations.sh
    - apps/api/src/common/database/schema.spec.ts
    - apps/api/prisma7.config.ts
    - apps/api/src/common/config/env.validation.ts
    - apps/api/src/common/database/prisma.service.ts
    - apps/api/src/common/database/prisma.module.ts
    - apps/api/src/common/database/prisma.service.spec.ts
  modified:
    - apps/api/package.json
key-decisions:
  - "Prisma 7.10.1 selected under the D-10/D-11 bounded comparison: MikroORM met the criteria but offered no project-critical advantage and has a heavier Nest/v7 integration surface"
  - "Owner lifecycle states encoded exactly as designed here (delegated by 01-03): users ACTIVE -> CLOSURE_REQUESTED -> CLOSURE_ACCEPTED -> ANONYMIZED; stores ACTIVE -> CLOSURE_REQUESTED -> CLOSED; orders distinguish in-flight from terminal obligations"
  - "Keyed tombstone stores only a unique HMAC subject_digest plus revocation outcome/attempts; no raw Clerk subject or email column exists; no legal retention period invented"
  - "Prisma 7.10.1 CLI auto-discovers prisma7.config.ts (verified against the pinned CLI); no prisma.config.ts alternative was kept"
  - "gen_random_uuid() DB defaults and @default(now()) @updatedAt keep the generated migration equivalent to the schema and allow raw-SQL constraint tests"
patterns-established:
  - "Disposable empty-database verification with apply -> schema drop -> re-apply for every migration, Docker preferred with a local initdb/pg_ctl fallback"
  - "Sanitized startup validation: errors name env variables only and never include their values"
requirements-completed: []
# AUTH-06 is delivered by Plan 01-08; OPS-05 was completed by Plan 01-02. This
# plan supplies their schema/config foundation but does not complete either.

# Metrics
duration: 13min
completed: 2026-11-17
---

# Phase 1 Plan 4: Prisma Schema, Migration & Database Runtime Foundation Summary

**Prisma 7.10.1 identity foundation: a reviewed, database-enforced migration (staged closure + keyed tombstone) and one validated Nest-managed pg-adapter client behind a single db:deploy/db:test entrypoint.**

## Performance

- **Duration:** ~13 min
- **Started:** 2026-11-17T06:50:00Z
- **Completed:** 2026-11-17T07:04:00Z
- **Tasks:** 2 of 2 (each followed TDD RED then GREEN)
- **Files modified:** 10 (9 created + `apps/api/package.json`) + this summary

## Accomplishments

- Created the Prisma 7.10.1 `users` / `user_capabilities` / `stores` / `orders` / `identity_tombstones` / `lifecycle_events` / `gallery_assets` schema. Uniqueness (Clerk subject, capability pair, tombstone digest), `ON DELETE RESTRICT` on every retained business reference, and an append-only audit trigger are enforced in the database. Profile fields are nullable only so D-07 anonymization can clear them; live accounts always populate them.
- Encoded the owner's binding lifecycle decisions without inventing policy: staged-closure on users/stores, in-flight-vs-terminal order statuses, and a permanent HMAC-only tombstone with provider-revocation outcome/attempt fields. No raw Clerk subject or email is stored anywhere in the schema or migration.
- Added a reviewed named migration generated by `prisma migrate diff --from-empty --to-schema` and kept equivalent to the schema (the only hand addition is the documented append-only trigger). Verified there are no `ON DELETE CASCADE` deletes, no embedded secrets and a nullable unique subject index.
- Wired one `PrismaService` with `@prisma/adapter-pg` using an explicit pool maximum of 5, 5 s acquire timeout and 10 s idle timeout, plus Nest init/destroy hooks; added `PrismaModule` and sanitized typed env validation.
- Defined the single `db:generate` / `db:deploy` / `db:test` entrypoint. Verified no other migration/provisioning command exists in the repository.

## Verification Evidence (commands actually run)

| Command | Result |
|---------|--------|
| `bash apps/api/scripts/test-migrations.sh` | PASS — apply to empty DB (8 tables incl. `_prisma_migrations`), drop schema/history, re-apply (8 tables), then constraint suite |
| `pnpm --filter @ecom-v1/api test -- src/common/database/schema.spec.ts` | PASS — 6 real-PostgreSQL constraint tests incl. gallery 200-row capacity and append-only audit |
| `pnpm --filter @ecom-v1/api exec prisma generate` | PASS — client v7.10.1 generated |
| `pnpm --filter @ecom-v1/api test -- src/common/database/prisma.service.spec.ts` | PASS — config validation + real DB connect/query/shutdown lifecycle |
| `pnpm --filter @ecom-v1/api typecheck` | PASS (strict TS 6) |
| `pnpm --filter @ecom-v1/api build` | PASS (`nest build`) |
| `pnpm --filter @ecom-v1/api test` (full suite) | PASS — 3 files, 12 tests |
| migration review (cascade/PII/secret grep, diff-vs-schema) | PASS — no delete cascades, no raw subject/secret, only the documented trigger differs from generated SQL |

**Environment note:** the Docker CLI is installed but **no Docker daemon is available in this environment**. The migration script therefore exercised the fallback path: a disposable local PostgreSQL **18.6** cluster created with `initdb`/`pg_ctl`. The Docker path remains the CI/Compose path (unchanged); no test result above is claimed from Docker.

## Task Commits

Each task was committed atomically on the main working tree with hooks enabled (no `--no-verify`):

1. **Task 1 (TDD RED): failing real-Postgres schema constraint suite** - `18c57f1` (test)
2. **Task 1 (TDD GREEN): identity lifecycle schema + migration + db:test script** - `2e8785b` (feat)
3. **Task 2 (TDD RED): failing env-validation and Prisma lifecycle suite** - `fa750b4` (test)
4. **Task 2 (TDD GREEN): validated Prisma runtime + CLI config + package entrypoints** - `b6777e6` (feat)

TDD gates: `test(01-04)` precedes `feat(01-04)` for both tasks. No refactor commit was needed.

## Files Created/Modified

- `apps/api/prisma/schema.prisma` — versioned identity/lifecycle/gallery-capacity data model.
- `apps/api/prisma/migrations/0001_identity_foundation/migration.sql` — reviewed forward-only migration + append-only trigger.
- `apps/api/scripts/test-migrations.sh` — disposable-DB apply/reset/re-apply + constraint entrypoint.
- `apps/api/src/common/database/schema.spec.ts` — real-Postgres constraint suite (self-provisioning when run standalone).
- `apps/api/prisma7.config.ts` — CLI config; DIRECT_URL only present when set so `generate` needs no DB.
- `apps/api/src/common/config/env.validation.ts` — typed config + sanitized `ConfigurationError` + pool constants.
- `apps/api/src/common/database/prisma.service.ts` — single pg-adapter `PrismaClient` with lifecycle hooks.
- `apps/api/src/common/database/prisma.module.ts` — provider module exporting the service.
- `apps/api/src/common/database/prisma.service.spec.ts` — config-failure and real-DB lifecycle tests.
- `apps/api/package.json` — `db:generate`, `db:deploy`, `db:test`.

## Decisions Made

- Kept exact Prisma 7.10.1 pins for CLI, client and adapter; no MikroORM or alternative ORM installed (T-04-SC).
- Named the CLI config `prisma7.config.ts` because the pinned 7.10.1 CLI auto-discovers that exact filename; no `prisma.config.ts` left behind.
- Chose DB-level UUID/timestamp defaults so schema and generated migration stay equivalent while raw SQL tests can insert rows.
- Kept all required secrets in the typed boundary (fail closed) but never logged; no values appear in errors.
- Did **not** mark requirements complete: AUTH-06 is implemented by Plan 01-08, and OPS-05 was already completed by Plan 01-02. This plan only supplies their database/config foundation.

## Deviations from Plan

### Adaptations (not scope changes)

**1. [Rule 3 - Blocking] `prisma generate` failed because `env('DIRECT_URL')` was resolved at config load**
- **Found during:** Task 2 verification.
- **Issue:** `prisma7.config.ts` used `env('DIRECT_URL')`, so `prisma generate` (which needs no connection) threw `PrismaConfigEnvError` when DIRECT_URL was unset.
- **Fix:** Config now adds the `datasource` block only when `DIRECT_URL` is present. Migrations still require it (Prisma fails clearly), and runtime fail-closed validation lives in `env.validation.ts`.
- **Files modified:** `apps/api/prisma7.config.ts`
- **Verified by:** `pnpm --filter @ecom-v1/api exec prisma generate` exits 0 without DIRECT_URL; `db:test` still applies migrations with DIRECT_URL.

**2. [Rule 3 - Blocking] `pg` has no committed type declarations and `@types/pg` is not inventoried**
- **Found during:** Task 1 and Task 2 typechecks.
- **Issue:** `pg` is present at an exact pin but `@types/pg` is not in the authoritative `DEPENDENCIES.md`, so `import { Client/Pool } from 'pg'` failed strict TS with TS7016.
- **Fix:** Used minimal structural interfaces for the small pg surface exercised, via a typed `require('pg')` cast. No new dependency, no lockfile change, no `any` annotation.
- **Files modified:** `apps/api/src/common/database/schema.spec.ts`, `apps/api/src/common/database/prisma.service.ts`, `apps/api/src/common/database/prisma.service.spec.ts`
- **Verified by:** `pnpm --filter @ecom-v1/api typecheck` exits 0; `pnpm install --frozen-lockfile` remains untouched.

**3. [Rule 3 - Blocking] Raw-SQL inserts failed on UUID/timestamp NOT NULL columns**
- **Found during:** Task 1 migration test.
- **Issue:** Prisma `@default(uuid())`/`@updatedAt` defaults are client-side, so raw SQL constraint inserts violated NOT NULL.
- **Fix:** Schema uses `@default(dbgenerated("gen_random_uuid()"))` and `@default(now()) @updatedAt`; the regenerated migration therefore carries matching DB defaults and stays equivalent to the schema.
- **Files modified:** `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/0001_identity_foundation/migration.sql`
- **Verified by:** all 12 tests pass; migration diff matches generated SQL except the documented trigger.

**4. [Environment adaptation] Docker daemon unavailable**
- **Found during:** Task 1 verification.
- **Issue:** `docker info` failed; the plan's "disposable PostgreSQL container" could not be started here.
- **Fix:** `test-migrations.sh` prefers Docker when the daemon is reachable and otherwise starts a local `initdb`/`pg_ctl` cluster. Both paths apply the same committed migration and run the same constraints.
- **Files modified:** `apps/api/scripts/test-migrations.sh`
- **Verified by:** full script passes on local PostgreSQL 18.6; no claim of a Docker-based pass is made.

**5. [Wiring detail] `db:test` uses a package-relative script path**
- **Issue:** the plan's literal `bash apps/api/scripts/test-migrations.sh` only resolves from the repo root, but `pnpm --filter` runs with `apps/api` as cwd.
- **Fix:** `"db:test": "bash scripts/test-migrations.sh"`; the script itself resolves `API_DIR` from `BASH_SOURCE`, so root invocation still works.
- **Files modified:** `apps/api/package.json`

**Total deviations:** 5 adaptations (all blocking-verification or environment-path issues). **Impact on plan:** none — no scope, dependency, product-policy or lifecycle change; all owner decisions preserved.

## Issues Encountered

- Task 1's initial GREEN run exposed 8 tables (Prisma ledger included) and two wrong test expectations (enum declaration order and SQLSTATE `23001` for `ON DELETE RESTRICT`). Count and assertions were corrected; these were test-expectation fixes, not schema defects.
- `prisma migrate diff` requires a datasource even when diffing empty -> schema; a temporary config was used for migration generation and removed before commit.

## Auth Gates

None. No authentication or package-legitimacy gate arose in this plan.

## Known Stubs

None. The `app.module.ts` scaffold remains intentionally empty by Plan 01-02; `PrismaModule` is provided but not yet imported into it (Plans 01-05/01-06 wire modules). This is next-phase integration, not a stubbed data source that blocks this plan's goal.

## Threat Flags

None. All new surface (schema, config boundary, DB connection paths, migration script) is within the plan's threat model and mitigated by exact pins, reviewed immutable SQL, database constraints, pooled/direct URL separation, bounded pool settings and sanitized errors. No new HTTP endpoint or auth path was added.

## Next Phase Readiness

- Plan 01-05 can apply the committed migration via `pnpm --filter @ecom-v1/api db:deploy` and run `db:test` in Compose/CI without inventing a second migration path.
- Plans 01-06/01-07 can resolve local users, enforce tombstone denial and query capabilities against stable UUIDs and unique constraints.
- Plan 01-08 can implement the fail-closed local-first transaction and provider-revocation retry against `identity_tombstones` and `lifecycle_events` using the exact states designed here.
- Exact lifecycle state names are recorded in this plan's schema/summary; no legal retention period was supplied or invented.

## Self-Check: PASSED

- Verified created files exist: all 9 new files listed above — FOUND.
- Verified task commits exist in git history: `18c57f1`, `2e8785b`, `fa750b4`, `b6777e6` — FOUND.
- Verification battery re-run and passing: migration script, schema tests, Prisma service tests, generate, typecheck, build, full suite.

---
*Phase: 01-platform-foundation-identity*
*Plan: 04*
*Completed: 2026-11-17*
