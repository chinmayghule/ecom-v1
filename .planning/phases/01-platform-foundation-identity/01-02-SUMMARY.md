---
phase: 01-platform-foundation-identity
plan: 02
subsystem: infra
tags: [pnpm, corepack, node24, vite-plus, nestjs12, typescript6, vitest, supertest, strict-ts, lockfile, supply-chain, test-harness]

# Dependency graph
requires:
  - phase: 01-01
    provides: "DEPENDENCIES.md: authoritative exact-pin inventory and the attributable owner approval for vitest@5.1.0"
provides:
  - "One pnpm@11.5.2 / Node 24.22.2 workspace with a committed, reproducible pnpm-lock.yaml"
  - "Strict TypeScript base config and a framework-native NestJS 12 API package (@ecom-v1/api) with no domain behaviour"
  - "The single Phase 1 test layout and an executable Vitest/Supertest baseline passing at both API and root level"
affects:
  - "All Phase 1 plans 01-03..01-09 (inherit the toolchain, strict tsconfig, test layout and lockfile)"
  - "Plan 01-04 onward (attach Prisma/schema, identity, authz and health modules to the empty AppModule)"
  - "Phase 8 CI/CD (reuses the committed lockfile, frozen install, build/typecheck/test scripts)"

# Tech tracking
tech-stack:
  added:
    - "Workspace root: vite-plus@1.6.0 (vp runner); pnpm@11.5.2 via Corepack 0.36.0; Node 24.22.2 (.nvmrc + engines)"
    - "API runtime: @nestjs/common/core/platform-express 12.5.0, @nestjs/config 12.1.1, @nestjs/swagger 12.1.2, @clerk/backend 3.29.0, @prisma/client & @prisma/adapter-pg 7.10.1, pg 8.23.1, pino 10.4.0, nestjs-pino 5.3.1, class-validator 0.15.1, class-transformer 0.5.1, reflect-metadata 0.2.2, rxjs 7.8.2"
    - "API dev: prisma 7.10.1, typescript 6.0.3, vitest 5.1.0, supertest 7.3.2, @types/supertest 7.2.1, @types/node 24.19.2, @nestjs/cli 12.0.13, @nestjs/testing 12.5.0"
  patterns:
    - "Framework-native builds (nest build); Vite+ orchestrates check/test only — no ESLint, Prettier, Biome, Lefthook, Husky or turbo"
    - "One test layout: co-located *.spec.ts, *.e2e-spec.ts under src/<domain>/, shared fixtures/setup under src/test/; no top-level apps/api/test/"
    - "Exact direct pins only, committed lockfile, frozen-lockfile installs, dependency lifecycle scripts disabled (T-02-02)"
key-files:
  created:
    - "package.json, pnpm-workspace.yaml, pnpm-lock.yaml, .nvmrc, tsconfig.base.json, vite.config.ts"
    - "apps/api/package.json, apps/api/tsconfig.json, apps/api/tsconfig.build.json, apps/api/nest-cli.json"
    - "apps/api/src/main.ts, apps/api/src/app.module.ts, apps/api/vitest.config.ts"
    - "apps/api/src/test/setup.ts, apps/api/src/test/app.e2e-spec.ts"
  modified:
    - ".gitignore (node_modules, dist, coverage, .env/.env.* with !.env.example, .vite-hooks; graphify-out/ retained)"
    - "tsconfig.base.json and pnpm-workspace.yaml (inline Rule 3 toolchain fixes, see Deviations)"
    - "apps/api/tsconfig.json (explicit types: ['node'], see Deviations)"
key-decisions:
  - "pnpm pinned to exactly pnpm@11.5.2 via Corepack 0.36.0 (environment-verified); STACK.md 'pnpm 12' discrepancy left as an owner escalation, not silently adopted"
  - "vitest@5.1.0 installed only after 01-01's attributable owner approval; registry metadata re-checked at install (name/version/repo/homepage/tarball matched DEPENDENCIES.md) and pinned exactly"
  - "Prisma transitive engine/scarf build scripts remain blocked via ignoreScripts: true rather than approved — no remote install script runs (T-02-02), and frozen installs are deterministic"
  - "TypeScript 6 node10 module resolution kept (NestJS 12 CJS convention) with an explicit 6.0 deprecation acknowledgement rather than switching build module systems"
  - "The baseline test creates/closes a real Nest testing application and exposes no production endpoint merely to turn green"
patterns-established:
  - "Single Vite+-delegated test orchestrator: root `test` = vp test run, root `check` = vp check; API build stays nest build"
  - "Root vite.config.ts declares the single API Vitest project; apps/api/vitest.config.ts owns include + setupFiles"
  - "Per-test environment defaults with beforeEach/afterEach restore; isolated workers; later DB suites get unique disposable databases"
requirements-completed: [OPS-05]

# Metrics
duration: 6min
completed: 2026-11-17
---

# Phase 01: Platform Foundation & Identity — Plan 02: Pinned Workspace & API Test Harness Summary

**Pinned pnpm 11.5.2 / Node 24.22.2 workspace with a committed lockfile, a strict-TypeScript NestJS 12 API, and a passing Vitest/Supertest harness at the single agreed test layout**

## Performance

- **Duration:** 6 min
- **Started:** 2026-11-17T06:41:35Z
- **Completed:** 2026-11-17T06:47:47Z
- **Tasks:** 3 of 3 (Task 3 followed TDD: RED then GREEN)
- **Files modified:** 14 primary files + this summary (see Files Created/Modified)

## Accomplishments

- Created the root workspace with exact `packageManager: pnpm@11.5.2`, `engines.node: 24.22.2`, `.nvmrc`, exact `vite-plus@1.6.0`, strict compiler defaults, and `check`/`test`/`build:api` scripts delegating to `vp` while keeping `nest build` native. No ESLint/Prettier/Biome/Lefthook/Husky/turbo added.
- Scaffolded `@ecom-v1/api` (NestJS 12) with exactly the inventoried runtime and dev dependencies at exact pins, a minimal `main.ts` bootstrap and an intentionally empty `AppModule`. Registered every package in `DEPENDENCIES.md`; resolved the seven "pin registry-resolved" entries from the official npm registry. No auth, DB, health, logging or business endpoint was added.
- Generated and committed `pnpm-lock.yaml` and made `pnpm install --frozen-lockfile` exit 0 with dependency lifecycle scripts disabled. Build and typecheck pass under strict TypeScript 6.0.3.
- Established the single Phase 1 test layout and a real baseline test: Vitest loads the deterministic setup without seed data or a live database, initializes and closes the Nest application, and is discovered by both the API and root test tasks (TDD RED then GREEN).

## Verification Evidence (commands actually run)

| Command | Result |
|---------|--------|
| `pnpm --version` | `11.5.2` (Corepack 0.36.0) |
| `npm view vitest@5.1.0 name version repository.url homepage dist.tarball` | matched the 01-01 owner-verification evidence exactly (gate re-check) |
| `pnpm install --frozen-lockfile` | PASS (exit 0, lockfile up to date) |
| `pnpm --filter @ecom-v1/api build` | PASS (`nest build`, exit 0) |
| `pnpm --filter @ecom-v1/api typecheck` | PASS (strict `tsc --noEmit`, exit 0) |
| `pnpm --filter @ecom-v1/api test` | PASS — 1 test file, 1 test passed |
| `pnpm test` | PASS — 1 test file, 1 test passed (root discovers the API project) |
| exact-pin / DEPENDENCIES.md inventory check | PASS — every direct dependency exact-pinned and inventoried |
| `test ! -d apps/api/test` and anti-pattern grep | PASS — no separate test tree; no `.only`, `.skip`, `sleep`, `setTimeout` or demo-seed dependency |
| `git diff --check` | PASS |

## Task Commits

Each task was committed atomically on the main working tree (no `--no-verify`):

1. **Task 1: Create the pinned workspace and unified toolchain** - `3a52d05` (build)
2. **Task 2: Scaffold the NestJS API and install the reviewed dependency set** - `1b79983` (build; includes the two inline toolchain fixes)
3. **Task 3 (TDD RED): add failing baseline API harness e2e test** - `31170b9` (test)
4. **Task 3 (TDD GREEN): implement the executable API Vitest/Supertest harness** - `671b0b4` (feat; includes the explicit-node-types fix)

TDD gate sequence: `test(01-02)` RED commit precedes `feat(01-02)` GREEN commit. No refactor commit was needed.

**Plan metadata:** recorded in the final docs commit (this summary + STATE/ROADMAP updates).

## Files Created/Modified

- `package.json` — root workspace manifest: exact pnpm/Node pins, `vite-plus@1.6.0`, `vp`-delegated check/test scripts.
- `pnpm-workspace.yaml` — `apps/api` membership plus `ignoreScripts: true` supply-chain policy.
- `pnpm-lock.yaml` — committed reproducible dependency graph (472 packages).
- `.nvmrc` — `24.22.2`.
- `tsconfig.base.json` — strict TypeScript with `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `useUnknownInCatchVariables` and the 6.0 deprecation acknowledgement.
- `vite.config.ts` — root Vitest project pointer to `apps/api/vitest.config.ts`.
- `.gitignore` — ignores `node_modules/`, `dist/`, `coverage/`, `.env`/`.env.*` (allowing `.env.example`), `.vite-hooks/`; keeps `.planning/` tracked and `graphify-out/` ignored.
- `apps/api/package.json` — `@ecom-v1/api` with exact runtime/dev pins and build/typecheck/test/test:watch scripts.
- `apps/api/tsconfig.json`, `apps/api/tsconfig.build.json`, `apps/api/nest-cli.json` — strict API compilation, build excludes tests, framework-native `nest build`.
- `apps/api/src/main.ts` — minimal framework-native bootstrap.
- `apps/api/src/app.module.ts` — intentionally empty root module (no endpoints/domain behaviour).
- `apps/api/vitest.config.ts` — the single API test project, include patterns and `setupFiles`.
- `apps/api/src/test/setup.ts` — deterministic, non-secret env defaults restored between tests.
- `apps/api/src/test/app.e2e-spec.ts` — baseline Nest testing-module harness (red then green).

## Decisions Made

- Kept pnpm at the environment-verified exact 11.5.2 and recorded the STACK.md "pnpm 12" discrepancy as an owner escalation rather than switching majors.
- Installed `vitest@5.1.0` only after re-confirming the 01-01 owner approval and the official registry metadata; no substitution or version float.
- Chose to disable all dependency lifecycle scripts (`ignoreScripts: true`) instead of approving Prisma's remote engine-download scripts, preserving T-02-02 and deterministic frozen installs.
- Preserved NestJS 12's CommonJS/node10 module resolution with an explicit TS 6 deprecation acknowledgement, rather than changing the build module system.
- Added no production endpoint to make the baseline test green; the test uses the Nest testing module and `getHttpServer()` as the Supertest seam.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] TypeScript 6.0.3 rejects deprecated `moduleResolution: node`**
- **Found during:** Task 2 verification (pre-install compatibility probe)
- **Issue:** `tsc` failed with TS5107: `moduleResolution=node10` is deprecated and errors in TS 6 unless acknowledged.
- **Fix:** Added `"ignoreDeprecations": "6.0"` to `tsconfig.base.json`, keeping NestJS 12's conventional CommonJS resolution.
- **Files modified:** `tsconfig.base.json`
- **Verification:** `pnpm --filter @ecom-v1/api build` and `typecheck` both exit 0.
- **Committed in:** `1b79983` (Task 2 commit)

**2. [Rule 3 - Blocking] `pnpm install --frozen-lockfile` exited 1 on blocked build scripts**
- **Found during:** Task 2 verification
- **Issue:** pnpm 11 reported `ERR_PNPM_IGNORED_BUILDS` for `@prisma/engines`, `@scarf/scarf` and `prisma`, making the plan's frozen-lockfile verification command fail. An initial `ignoredBuiltDependencies` declaration did not take effect in pnpm 11.
- **Fix:** Set `ignoreScripts: true` in `pnpm-workspace.yaml` — a global policy that keeps remote lifecycle scripts disabled (T-02-02) and makes frozen installs deterministic. No package install/version was substituted.
- **Files modified:** `pnpm-workspace.yaml` (and lockfile regenerated)
- **Verification:** `pnpm install --frozen-lockfile` exits 0; no remote install script ran.
- **Committed in:** `1b79983` (Task 2 commit)

**3. [Rule 3 - Blocking] Test harness typecheck failed on unresolved `process`**
- **Found during:** Task 3 (GREEN) verification
- **Issue:** With TS 6, ambient `@types/node` was not auto-included, so `src/test/setup.ts` failed with TS2591 (`Cannot find name 'process'`) even though build passed.
- **Fix:** Added `"types": ["node"]` to `apps/api/tsconfig.json`.
- **Files modified:** `apps/api/tsconfig.json`
- **Verification:** `pnpm --filter @ecom-v1/api typecheck` exits 0 with test files included.
- **Committed in:** `671b0b4` (Task 3 GREEN commit)

---

**Total deviations:** 3 auto-fixed (all Rule 3 blocking toolchain/config issues). **Impact on plan:** none — no dependency substitution, no domain behaviour, no scope creep; all fixes were required to make the pinned toolchain build, typecheck and install deterministically.

## Auth Gates

None in this plan. The `vitest@5.1.0` legitimacy gate was a blocking owner decision resolved in Plan 01-01 (APPROVED after official-source verification); this plan only re-checked the registry metadata and installed the exact approved pin. No gate was auto-approved here.

## Known Stubs

- `apps/api/src/app.module.ts` — `@Module({})` is intentionally empty (no controllers/providers). This is the plan's required scaffold baseline, not a deferred data source; later Phase 1 plans attach identity, database, authorization and health modules. It does not block this plan's goal.

## Threat Flags

None. No new network endpoint, auth path, file-access pattern or schema change was introduced (verified: no `@Controller`/HTTP decorators in `apps/api/src`). Dependency-supply threats T-02-01, T-02-02, T-02-05 and T-02-SC are mitigated by exact pins, the committed lockfile, frozen-lockfile verification, disabled lifecycle scripts and the 01-01 owner gate. T-02-03 (secret leakage) is mitigated by `.gitignore`; T-02-04 (unbounded test process) by deterministic setup and explicit `app.close()` teardown.

## Issues Encountered

- The three blocking toolchain issues above were resolved automatically; no user decision was required. The `pnpm 12` update notice printed by pnpm was deliberately ignored per the recorded owner-escalation rule.

## User Setup Required

None — no external service configuration is required by this scaffold-only plan. (Live Clerk configuration and any database URL remain later-phase, manual concerns.)

## Next Phase Readiness

- A clean clone can now run `pnpm install --frozen-lockfile`, `pnpm --filter @ecom-v1/api build`, `typecheck`, `test` and `pnpm test` reproducibly on the pinned toolchain.
- Plan 01-03 and later backend plans can attach modules to `AppModule` and add co-located `*.spec.ts` / `*.e2e-spec.ts` suites under `apps/api/src/` using the shared setup and Supertest seam.
- Blocker to keep visible: backend host/card-on-file zero-spend escalation (recorded in STATE.md) is unchanged by this plan and is not deferred here.

## Self-Check: PASSED

- All 17 plan-created/modified files verified present, including `pnpm-lock.yaml`, `apps/api/vitest.config.ts`, `apps/api/src/test/setup.ts`, `apps/api/src/test/app.e2e-spec.ts` and this summary.
- All four task commits verified in `git log`: `3a52d05` (Task 1), `1b79983` (Task 2), `31170b9` (Task 3 RED), `671b0b4` (Task 3 GREEN).
- Verification battery re-run and passing: `pnpm install --frozen-lockfile`, API `build`, `typecheck`, `test`, root `pnpm test`, `git diff --check`.
- TDD gate sequence confirmed in git history: `test(01-02)` before `feat(01-02)`; no `.only`, skipped test, sleep or open handle left behind.

---
*Phase: 01-platform-foundation-identity*
*Completed: 2026-11-17*
