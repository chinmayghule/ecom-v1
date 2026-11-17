---
phase: 01-platform-foundation-identity
plan: 05
subsystem: api-runtime-ops
tags: [validation, exception-filter, pino, nestjs-pino, openapi, swagger, health-readiness, prisma, docker-compose, postgres]

# Dependency graph
requires:
  - phase: 01-02
    provides: "Pinned Node/pnpm/NestJS 12 workspace, strict TS 6 config and the single Vitest/Supertest API harness"
  - phase: 01-04
    provides: "The single PrismaService, PrismaModule and db:deploy migration entrypoint used by readiness and Compose"
provides:
  - "One global validation pipe and sanitized exception filter on every HTTP request"
  - "Structured Pino request logs with requestId/outcome/route and credential/body/profile redaction"
  - "Public liveness plus a bounded, real-PostgreSQL readiness probe with non-2xx failure"
  - "apps/api/src/openapi.ts as the single code-first OpenAPI document assembler"
  - "One-command Docker Compose API + PostgreSQL stack with migration-before-serving ordering"
affects:
  - "Plan 01-06 (global Clerk guard honors IS_PUBLIC_KEY; logs must stay redacted), 01-07 (extends openapi.ts, never duplicates it), 01-08/01-09 (CI and Compose reuse db:deploy)"

# Tech tracking
tech-stack:
  added:
    - "class-validator/class-transformer global ValidationPipe policy (whitelist + forbidNonWhitelisted + forbidUnknownValues)"
    - "nestjs-pino 5.3.1 / pino 10.4.0 with whitelist req/res serializers and defence-in-depth redact paths"
    - "@nestjs/swagger 12.1.2 code-first DocumentBuilder in one assembler file"
    - "Multi-stage node:24.22.2-alpine Dockerfile with Corepack-pinned pnpm@11.5.2 and frozen-lockfile install"
    - "postgres:17-alpine Compose service with health-gated dependency and API liveness healthcheck"
  patterns:
    - "One request-boundary policy: pipe + filter registered globally in main.ts, never per controller"
    - "Log safety by whitelist serializer first, redaction second; query strings stripped from paths"
    - "Readiness fails closed with a bounded probe via the single PrismaService; timeout is an injectable token seam"
    - "Migration-before-serving runs the shared db:deploy entrypoint in the container command with no sleep"
key-files:
  created:
    - apps/api/src/common/validation/validation.pipe.ts
    - apps/api/src/common/validation/validation.pipe.spec.ts
    - apps/api/src/common/errors/api-error.ts
    - apps/api/src/common/errors/api-exception.filter.ts
    - apps/api/src/common/errors/api-exception.filter.spec.ts
    - apps/api/src/common/logging/pino.config.ts
    - apps/api/src/common/logging/pino.config.spec.ts
    - apps/api/src/common/logging/logging.module.ts
    - apps/api/src/common/auth/is-public.decorator.ts
    - apps/api/src/health/health.controller.ts
    - apps/api/src/health/health.service.ts
    - apps/api/src/health/health.module.ts
    - apps/api/src/health/health.spec.ts
    - apps/api/src/openapi.ts
    - apps/api/Dockerfile
    - apps/api/.dockerignore
    - apps/api/.env.example
    - compose.yaml
    - .dockerignore
  modified:
    - apps/api/src/main.ts
    - apps/api/src/app.module.ts
    - apps/api/src/test/setup.ts
    - apps/api/src/test/app.e2e-spec.ts
    - apps/api/package.json
    - pnpm-lock.yaml
key-decisions:
  - "Validation and error handling are structural: one global pipe and one global filter, with no per-controller branches"
  - "Client error bodies carry only statusCode/code/message/requestId (plus sanitized field tokens); all original detail goes only to the server-side Pino sink"
  - "Log record fields are a whitelist (requestId, userId when present, outcome, method, path without query, route); redaction is retained as defence in depth"
  - "apps/api/src/openapi.ts is the only OpenAPI document source; Plan 07 extends this file rather than adding a second assembler"
  - "Readiness probes with a real $queryRaw SELECT through the single PrismaService and fails closed on rejection, timeout or malformed result"
  - "Health routes carry explicit IS_PUBLIC metadata so Plan 06's global guard protects everything else by default"
  - "The pinned Prisma CLI is a runtime dependency because the container must run the single db:deploy entrypoint after dev deps are pruned"
patterns-established:
  - "Bootstrap order in main.ts: global Pino logger, then global pipe and filter, then the single OpenAPI assembler, then listen"
  - "Health liveness is process-only; readiness is dependency-aware and never returns a constant 200"
  - "Compose gates on healthchecks (no sleeps): postgres service_healthy before api, then db:deploy before start:prod"
requirements-completed: [OPS-03, OPS-05]
# OPS-03 (Pino logging + honest health visibility) is delivered here. OPS-05's
# Compose portion is delivered here; its CI portion is owned by Plan 09.

# Metrics
duration: 10min
completed: 2026-11-17
---

# Phase 1 Plan 5: API Request Boundary, Observability and One-Command Startup Summary

**Global validation and sanitized errors, redacted Pino request logs, real-PostgreSQL readiness, a single OpenAPI assembler, and a health-gated API+PostgreSQL Compose stack**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-11-17T07:08:52Z
- **Completed:** 2026-11-17T07:18:53Z
- **Tasks:** 3 of 3 (Tasks 1–2 followed TDD RED → GREEN)
- **Files modified:** 19 created + 6 modified (plus this summary)

## Accomplishments

- Registered one global `ValidationPipe` (`transform`, `whitelist`, `forbidNonWhitelisted`, `forbidUnknownValues`) rejecting undeclared body/query/param fields before controllers run, and one global exception filter translating faults to a fixed status/code/message/requestId envelope with no SQL, stack, provider or secret detail.
- Configured nestjs-pino with a whitelist request serializer (id, method, path-without-query, route), stable `requestId`/`outcome`/`userId`-when-present fields, and redaction paths for authorization, cookies, bodies and secret-like keys. A dedicated log-shape spec inspects real JSON emitted to a Pino stream.
- Added explicit `@IsPublic()` metadata and public `/health/live` (process-only) and `/health/ready` routes; readiness runs a bounded real `$queryRaw` through the single `PrismaService` and returns 503 `SERVICE_UNAVAILABLE` on rejection, timeout or a malformed result.
- Created `apps/api/src/openapi.ts` as the repository's only OpenAPI document builder (title, version, bearer scheme), registered once from `main.ts`.
- Added a multi-stage pinned Node/pnpm Dockerfile, non-secret env template, and a Compose stack where PostgreSQL health gates API start and the API applies the shared `db:deploy` migration before serving, with its own liveness healthcheck. No sleeps and no committed secrets.

## Verification Evidence (commands actually run)

| Command | Result |
|---------|--------|
| `pnpm --filter @ecom-v1/api test` (full suite) | PASS — 7 files, 40 tests |
| `pnpm --filter @ecom-v1/api test -- <task 1 specs>` | PASS at GREEN (RED confirmed 3 failing files first) |
| `pnpm --filter @ecom-v1/api test -- src/health/health.spec.ts` | PASS via full suite; RED confirmed missing-module failure first |
| `pnpm --filter @ecom-v1/api typecheck` | PASS (strict TS 6) |
| `pnpm --filter @ecom-v1/api build` | PASS (`nest build`) |
| `pnpm install --frozen-lockfile --offline` | PASS — lockfile up to date with the dependency-category move |
| `docker compose config --quiet` | PASS (exit 0) |
| OpenAPI assembler scan (`new DocumentBuilder\|SwaggerModule.createDocument`) | PASS — only `apps/api/src/openapi.ts` |
| Sleep/migration-ordering scan | PASS — no sleep in Compose/Dockerfile; one runtime migration entrypoint (`db:deploy`) |

**Environment note:** the Docker CLI and Compose v2 plugin are installed, but **no Docker daemon is available in this environment**. `docker compose config --quiet` was verified; `docker compose build`, `docker compose up -d --wait --wait-timeout 180` and the bounded readiness poll were **not run** and are not claimed as passing. The readiness test instead used the same real disposable local PostgreSQL fallback as Plan 01-04 (`initdb`/`pg_ctl`), proving a genuine dependency query; the unavailable/timeout cases used a controlled Prisma failure seam with an injectable timeout (no sleep).

## Task Commits

Each task was committed atomically on the main working tree with hooks enabled (no `--no-verify`):

1. **Task 1 RED (test):** `3f0285b` — failing boundary validation, error and log-shape specs
2. **Task 1 GREEN (feat):** `2a03a47` — global validation, sanitized errors, Pino logging, single OpenAPI assembler
3. **Task 2 RED (test):** `265ddb4` — failing liveness and real-DB readiness specs
4. **Task 2 GREEN (feat):** `a2f681a` — liveness and real-PostgreSQL readiness routes
5. **Task 3 (build):** `cd46447` — Dockerfile, Compose, env template and single-entrypoint migration packaging

TDD gates: `test(01-05)` precedes `feat(01-05)` for both TDD tasks. No refactor commit was needed.

## Files Created/Modified

- `apps/api/src/common/validation/validation.pipe.ts` (+ spec) — the one global validation policy.
- `apps/api/src/common/errors/api-error.ts`, `api-exception.filter.ts` (+ spec) — stable codes and the sanitized envelope/filter.
- `apps/api/src/common/logging/pino.config.ts` (+ spec), `logging.module.ts` — structured, redacted request logging provider.
- `apps/api/src/common/auth/is-public.decorator.ts` — stable public-route metadata key for Plan 06.
- `apps/api/src/health/*` — liveness/readiness controller, service, module and real-DB spec.
- `apps/api/src/openapi.ts` — the single code-first OpenAPI assembler.
- `apps/api/src/main.ts`, `app.module.ts` — wire logger, pipe, filter, health and OpenAPI.
- `apps/api/src/test/setup.ts`, `app.e2e-spec.ts` — non-secret test env defaults and a Prisma stub for the baseline harness.
- `apps/api/Dockerfile`, `.dockerignore`, `.env.example`, root `.dockerignore`, `compose.yaml` — one-command local packaging.
- `apps/api/package.json`, `pnpm-lock.yaml` — `start:prod`, runtime-available pinned Prisma CLI and matching lockfile importer.

## Decisions Made

- Error responses use fixed prose and stable codes; validation details are reduced to safe field/constraint tokens, and every thrown value's original message/stack goes only to the server-side sink.
- The request log's only `req` fields are a whitelist; Pino `redact` is kept as a second layer in case future log payloads add fields.
- Readiness timeout is an injectable token with a 5 s production default; the test seam avoids arbitrary sleeps and unbounded retries.
- The pinned `prisma` CLI stays in `dependencies` (same exact 7.10.1 pin) so the runtime image can execute the single `db:deploy` entrypoint; no second migration command was introduced.
- Compose's API healthcheck targets liveness so container health does not conflate process state with PostgreSQL state; readiness remains independently probeable.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added a dedicated Pino log-shape spec**
- **Found during:** Task 1 (behavior Test 3 required a log-shape assertion but no spec file was listed).
- **Issue:** The plan's `<files>` listed only validation and filter specs, yet a must-have requires proving emitted request logs contain no credentials/bodies/profiles.
- **Fix:** Added `apps/api/src/common/logging/pino.config.spec.ts`, asserting the JSON actually written to a Pino destination stream.
- **Verification:** log-shape test passes; full suite 7 files/40 tests.
- **Committed in:** `3f0285b` (RED), `2a03a47` (GREEN).

**2. [Rule 3 - Blocking] Baseline test harness needed env defaults and a Prisma stub**
- **Found during:** Task 2 GREEN, after `AppModule` imported `HealthModule`/`PrismaModule`.
- **Issue:** `app.e2e-spec.ts` would fail startup validation and try a real DB connection once `PrismaService` was in the module graph.
- **Fix:** Added non-secret required-env defaults to `src/test/setup.ts` and overrode `PrismaService` with a stub in the baseline e2e spec.
- **Verification:** full suite passes, including the baseline harness; real-DB behavior is still proven in `health.spec.ts` and `prisma.service.spec.ts`.
- **Committed in:** `a2f681a` (Task 2 GREEN).

**3. [Rule 2 - Missing Critical] `CLERK_SECRET_KEY` in the env template**
- **Found during:** Task 3.
- **Issue:** `validateEnv()` requires `CLERK_SECRET_KEY`, but the plan's `.env.example` field list omitted it; the API container would fail closed on start.
- **Fix:** Added a clearly non-secret local placeholder to `apps/api/.env.example` and a Compose default.
- **Verification:** `docker compose config --quiet` passes; all required env names are present.
- **Committed in:** `cd46447` (Task 3).

**4. [Rule 3 - Blocking] Prisma CLI unavailable after dev-dependency pruning**
- **Found during:** Task 3 Dockerfile design.
- **Issue:** The container must run `prisma migrate deploy` via the shared `db:deploy` entrypoint, but `prisma` was a devDependency and the runtime stage prunes dev dependencies.
- **Fix:** Promoted `prisma` to `dependencies` at the same exact 7.10.1 pin, updated the lockfile importer, added `start:prod`, and verified `pnpm install --frozen-lockfile --offline`.
- **Verification:** frozen-lockfile check passes; no second migration command exists.
- **Committed in:** `cd46447` (Task 3).

**5. [Rule 3 - Blocking] Root `.dockerignore` required for the actual build context**
- **Found during:** Task 3.
- **Issue:** Compose builds from the repository root, but Docker reads only the context-root `.dockerignore`; the plan-required `apps/api/.dockerignore` would be ignored.
- **Fix:** Created both files with equivalent exclusions (node_modules, dist, coverage, local env files, logs).
- **Verification:** `docker compose config --quiet` resolves the root context; no secret/local env file is included.
- **Committed in:** `cd46447` (Task 3).

---

**Total deviations:** 5 auto-fixed (1 missing-critical test coverage, 2 blocking wiring/runtime, 1 missing-critical env name, 1 build-context correctness). **Impact on plan:** no scope, dependency-pin, product-policy or owner-decision change; all fixes required for the plan's must-haves to actually work.

## Issues Encountered

- GREEN-phase test-fixture corrections: the raw-body boundary test needed a class DTO because Nest's `ValidationPipe` skips validation for the `Object` metatype, and the Pino assertion needed to read the nested `req` serializer output. Both were test-expectation fixes, not implementation defects (`2a03a47`).
- Docker daemon unavailable in this environment; the Compose smoke could not be executed (see Verification Evidence). No Docker pass is claimed.

## User Setup Required

None — all Compose defaults are local-only non-secret placeholders. Real Clerk credentials belong in a git-ignored `.env` override and are needed only for the browser journeys owned by later plans.

## Next Phase Readiness

- Plan 01-06 can add the global Clerk guard: `IS_PUBLIC_KEY` is the stable metadata contract, and health routes are already marked public.
- Plan 01-07 can extend `apps/api/src/openapi.ts` with the current-profile path; no second assembler exists to conflict with it.
- Plan 01-09 can run `db:deploy` against a clean database in CI and reuse the same Compose/environment contract.
- No blocker for the next plan; the only verification gap is the unrun Docker Compose smoke due to the missing daemon.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: public-docs-endpoint | apps/api/src/openapi.ts | `SwaggerModule.setup` serves the generated OpenAPI UI at `/api/docs`. This new HTTP surface is not individually listed in the plan's STRIDE register (the generic HTTP-client → Nest-pipeline boundary applies). It is intentionally public for local/demo contract visibility; consider restricting it before any non-local deployment. |

## Self-Check: PASSED

- Verified all 16 created files listed above exist — FOUND.
- Verified all 5 task commits exist in git history: `3f0285b`, `2a03a47`, `265ddb4`, `a2f681a`, `cd46447` — FOUND.
- Verification battery re-run and passing: full API suite (7 files/40 tests), typecheck, build, frozen-lockfile check, `docker compose config --quiet`, OpenAPI-assembler and ordering scans.

---
*Phase: 01-platform-foundation-identity*
*Plan: 05*
*Completed: 2026-11-17*
