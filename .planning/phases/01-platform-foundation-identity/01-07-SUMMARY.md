---
phase: 01-platform-foundation-identity
plan: 07
subsystem: identity
tags: [authorization, capabilities, ownership, openapi, clerk, nestjs, supertest, prisma, rbac]

# Dependency graph
requires:
  - phase: 01-04
    provides: "Prisma schema with local users, capabilities, orders and keyed tombstone storage"
  - phase: 01-05
    provides: "Global validation pipe, sanitized exception filter and redacted Pino boundary"
  - phase: 01-06
    provides: "Deny-by-default Clerk guard, @CurrentUser decorator and application-owned identity service"
  - phase: 01-05
    provides: "The single code-first openapi.ts assembler that this plan extends, never duplicates"
provides:
  - "Action-level capability guard driven only by guard-resolved local user and server route metadata"
  - "Authenticated GET /users/me returning a minimal, server-derived local profile projection"
  - "The single OpenAPI baseline extended with bearer security, the profile path and deterministic emission"
  - "Owner-scoped database predicate plus role/ownership denial proof against real PostgreSQL"
  - "The Clerk signup/session/sign-out/claims configuration and manual live-instance verification contract"
affects:
  - "Plan 01-08 (deletion/closure reuses local capability state), Plan 01-09 (acceptance suite), Phase 2+ (adopt RequireCapability and owner-predicate patterns), Phase 4 (OpenAPI freeze + @hey-api generator), Phase 5 (browser Clerk handoff)"

# Tech tracking
tech-stack:
  added:
    - "Nest Reflector metadata guard (RequireCapability) plus a pure capability predicate"
    - "@nestjs/swagger DTO projections and a deterministic baseline serializer"
    - "Test-only Nest fixture module with Prisma owner-predicate queries (src/test, excluded from production build)"
  patterns:
    - "Authorization metadata is server-only; a client body/query/param can never supply a role or owner"
    - "Private rows are fetched with resource id AND current local user id in one database predicate; foreign rows are non-disclosing 404"
    - "No second OpenAPI document: one assembler, one DocumentBuilder, one emission script"
    - "Each TDD task commits RED (test) before GREEN (feat) on the main tree with hooks enabled"

key-files:
  created:
    - apps/api/src/common/authorization/capability.guard.ts (+ spec)
    - apps/api/src/common/authorization/require-capability.decorator.ts
    - apps/api/src/identity/identity.controller.ts
    - apps/api/src/identity/dto/user-profile.dto.ts
    - apps/api/src/identity/identity.e2e-spec.ts
    - apps/api/src/test/fixtures/private-resource.fixture.ts
    - apps/api/scripts/emit-openapi.cjs
    - docs/identity/clerk-integration.md
  modified:
    - apps/api/src/common/auth/auth.module.ts
    - apps/api/src/identity/identity.service.ts
    - apps/api/src/identity/identity.types.ts
    - apps/api/src/openapi.ts
    - apps/api/src/main.ts
    - apps/api/src/app.module.ts
    - apps/api/package.json
    - .gitignore

key-decisions:
  - "Customer stays the implicit baseline; only MERCHANT/ADMIN can be required, and the decision reads local persisted capabilities rather than Clerk metadata or client fields"
  - "GET /users/me accepts no user id and returns only id/email/displayName/capabilities; the Clerk subject, tombstone and lifecycle audit never leave the boundary"
  - "The OpenAPI document remains an unfrozen 0.1.0 baseline; @hey-api/openapi-ts 0.99.0 is recorded as the Phase 4 generator choice and is not installed here"
  - "Ownership is a database predicate (id + current local user id); a foreign resource is never fetched and then rejected"
  - "Browser sign-out ends the browser-held session; copied-token/revocation guarantees follow the owner's keyed-permanent-tombstone-local-first resolution (Plan 03)"

patterns-established:
  - "CapabilityGuard runs after the global Clerk guard and reads only request.user plus Reflector metadata"
  - "Test-only fixture modules live under src/test/ and are never imported by AppModule or main.ts"
  - "OpenAPI baselines are emitted deterministically to a gitignored apps/api/.generated/ directory"

requirements-completed: [AUTH-01, AUTH-02, AUTH-03, OPS-01]

# Metrics
duration: 9min
completed: 2026-11-17
---

# Phase 1 Plan 7: Capability Enforcement, Current Profile and Clerk Contract Summary

**Local capability guard and owner-predicate ownership tests, a thin authenticated `/users/me` profile on the single OpenAPI baseline, and the documented Clerk signup/session/claims contract.**

## Performance

- **Duration:** ~9 min
- **Started:** 2026-11-17T07:44:16Z
- **Completed:** 2026-11-17T07:52:56Z
- **Tasks:** 3 of 3 (each TDD RED → GREEN)
- **Files:** 18 created/modified (including this summary)

## Accomplishments

- Added `RequireCapability` metadata plus `CapabilityGuard`, registered globally after the Clerk guard. The guard checks only the guard-resolved `AuthenticatedUser` and server metadata; customer is the implicit baseline and a client cannot supply a role/owner field. A pure `hasRequiredCapability` predicate covers the matrix.
- Added `GET /users/me` as a thin controller over `IdentityService.currentProfile()`. The response is exactly `id`, `email`, `displayName`, `capabilities`; the Clerk subject, tombstone, provider and lifecycle fields are absent. Nullable email/display name match the Plan 04 columns and Plan 06 contract (null only for an anonymized account).
- Extended the single `openapi.ts` assembler with a deterministic baseline serializer and the Phase 4 generator note. `openapi:emit` writes a byte-stable, gitignored `apps/api/.generated/openapi.baseline.json`; two consecutive runs produced the same SHA-256 (`c86346c3…`). The document stays version `0.1.0` (unfrozen).
- Added a test-only `PrivateResourceFixtureModule` whose order query places both the resource id and the current local user id in the same Prisma `where` predicate. Real-PostgreSQL e2e tests prove 401 (missing/invalid token), 400 (malformed id), 403 (customer on admin action, including with client-supplied role fields), 200 (owner), 201 (admin) and non-disclosing 404 (cross-owner, no row data).
- Wrote `docs/identity/clerk-integration.md` with all eight required sections, exact verifier claim names/types, authorized-party and bearer contract, no-webhook provisioning, staged closure/tombstone sign-out boundary, the Phase 5 handoff, and a credential-free manual live-instance procedure.

## Verification Evidence (commands actually run)

| Command | Result |
|---------|--------|
| `pnpm --filter @ecom-v1/api test -- src/common/authorization/capability.guard.spec.ts` | PASS — the runner executed the whole project: 14 files / 83 tests, 0 skipped |
| `pnpm --filter @ecom-v1/api test -- src/identity/identity.e2e-spec.ts` | PASS — 14 files / 83 tests, 0 skipped (incl. 13 identity e2e cases) |
| `pnpm --filter @ecom-v1/api test` (full suite) | PASS — 14 files, 83 tests, 0 skipped (baseline was 12 files / 64 tests) |
| `pnpm --filter @ecom-v1/api typecheck` | PASS (strict TS 6) |
| `pnpm --filter @ecom-v1/api build` | PASS (`nest build`) |
| `pnpm --filter @ecom-v1/api openapi:emit` | PASS; baseline paths `/health/live`, `/health/ready`, `/users/me`; `securitySchemes: bearer`; `/users/me` security `[{"bearer":[]}]`; no secret/claim/tombstone values |
| Repeat `openapi:emit` + SHA-256 | identical (`c86346c31e229b88d58f0a8ad59af4c6304ed7358ddaf1f4a3b7716f43734d58`) |
| Doc-section greps (all 8 headings) | FOUND |
| Single-document check | 1 `new DocumentBuilder`, 1 `SwaggerModule.setup`, both in `apps/api/src/openapi.ts` |
| Fixture isolation check | `PrivateResourceFixtureModule` appears only in the e2e spec; not in `app.module.ts`, `main.ts` or production modules |

**Environment note:** no Docker daemon is available here, so the real-PostgreSQL e2e used the same disposable `initdb`/`pg_ctl` cluster plus the committed migration as Plans 01-04/01-05/01-06. The live Clerk dashboard check remains a manual owner action by design (see User Setup Required).

## Task Commits

Each task was committed atomically on the main working tree with hooks enabled (no `--no-verify`), RED before GREEN:

1. **Task 1: capability/ownership primitives** — `06ac827` (test), `5c48258` (feat)
2. **Task 2: current profile + OpenAPI baseline** — `f62f94b` (test), `c2c5905` (feat)
3. **Task 3: role/ownership denials + Clerk contract** — `f766331` (test), `f8ca542` (feat)

TDD gates verified in git log: each `test(01-07)` commit precedes its `feat(01-07)` commit. No refactor commit was needed.

## Files Created/Modified

- `apps/api/src/common/authorization/capability.guard.ts` — guard plus pure predicate; only local capabilities and route metadata.
- `apps/api/src/common/authorization/capability.guard.spec.ts` — 403/200 matrix, client-field rejection, baseline-route behaviour.
- `apps/api/src/common/authorization/require-capability.decorator.ts` — privileged-capability metadata.
- `apps/api/src/identity/identity.controller.ts` / `dto/user-profile.dto.ts` — thin `GET /users/me` and typed projection.
- `apps/api/src/identity/identity.service.ts` / `identity.types.ts` — `currentProfile()` projection and `UserProfile` contract.
- `apps/api/src/identity/identity.e2e-spec.ts` — profile/OpenAPI cases plus real-DB role/ownership and doc cases.
- `apps/api/src/test/fixtures/private-resource.fixture.ts` — test-only owner-scoped query and admin action.
- `apps/api/src/openapi.ts` — extended single assembler, deterministic serializer, Phase 4 generator note.
- `apps/api/scripts/emit-openapi.cjs` — emits the baseline using the one compiled assembler.
- `apps/api/src/main.ts` / `app.module.ts` — global guard order and controller registration.
- `apps/api/src/common/auth/auth.module.ts` — provides/exports the capability guard.
- `apps/api/package.json` / `.gitignore` — `openapi:emit` script and generated-output ignore rule.
- `docs/identity/clerk-integration.md` — the human configuration and verification contract.

## Decisions Made

- A privileged action must be explicit; absence of metadata means the authenticated customer baseline is sufficient. There is no account-type enum, and merchant/admin remain additive, independent capabilities.
- The profile projection is intentionally minimal and excludes every provider/lifecycle field; a nullable value means "anonymized", never "unknown".
- Emitting a deterministic baseline keeps Phase 1 inspectable without starting a contract freeze or pulling the Phase 4 generator into this phase.
- The ownership fixture is test-only so no production module gains a second private-resource pattern before the real store/order modules exist.

## Deviations from Plan

### Implementation details needed to satisfy the plan

- The plan's `openapi:emit` script required an emitter. Implemented it as `apps/api/scripts/emit-openapi.cjs` (not in the plan's `files_modified` list) and added `apps/api/.generated/` to `.gitignore`; no new OpenAPI document source was introduced.
- The capability guard is registered globally in `main.ts` during Task 1 (it is part of "action-level capabilities are backend-enforced"), while `main.ts` is also listed under Task 2's file group. Task 2 did not need a further `main.ts` change.
- The `gsd-sdk` CLI named by the workflow is not installed in this runtime. State/roadmap bookkeeping used the bundled `gsd-tools.cjs` equivalents and precise manual edits to `.planning/STATE.md` / `.planning/ROADMAP.md`; no version pin or dependency was changed.

**Total: 3 documentation/sequencing notes. No scope, dependency-pin or product-policy change.**

## Issues Encountered

- `class-validator` 0.15.1 exports `IsUUID`, not `IsUuid`; corrected the fixture DTO decorator during GREEN (test-only impact, no behavior change).
- Overriding `PrismaService` with the live client let each Nest app's `close()` end the shared `pg` pool. The real-DB harness now injects a proxy with no-op lifecycle hooks over the same real model delegates, so all 8 denial tests share one migrated database. Both fixes were committed in `f8ca542`.
- The `vp test run -- <path>` argument does not filter files in this toolchain; targeted commands executed the full 14-file suite. Reported results reflect exactly what ran.

## User Setup Required

The plan declares Clerk dashboard setup and one manual live-instance check. To complete the AUTH-01..03 provider configuration, the owner must verify the live Clerk instance against `docs/identity/clerk-integration.md`: required email + one custom display-name field at signup, email verification enabled, a session token carrying `primaryEmail`, `displayName` and `emailVerified`, and an authorized party matching `CLERK_WEB_ORIGIN`. A decoded test token must show those three claims. This is recorded as a manual configuration check, never an automated pass; browser sign-up/sign-in/persistence/sign-out are deliberately Phase 5's deliverable.

## Known Stubs

None. The nullable `email`/`displayName` fields are contract-required anonymization states, not placeholders; no TODO/FIXME or unwired data source was introduced.

## Threat Flags

None. New surfaces (capability metadata guard, minimal profile DTO, owner-predicate fixture, OpenAPI baseline) are all in the plan's STRIDE register T-07-01..T-07-06 and are covered by code, tests or documentation. No new network endpoint, auth path, file access pattern or schema change was added.

## Next Phase Readiness

- Plan 01-08 can implement deletion/closure and the keyed tombstone using the local capability state and `subjectDigestFor()`; no webhook or provider credential path was introduced here.
- Phase 2+ modules should reuse `RequireCapability` and the owner-predicate pattern; the fixture is excluded from production builds.
- Phase 4 owns the OpenAPI freeze, generator install and drift gate; Phase 5 owns the browser Clerk handoff.

## Self-Check: PASSED

- Verified all 18 plan files exist, including the controller, DTO, guard, decorator, fixture, emit script, doc and both modified bootstrap files — FOUND.
- Verified all six task commits exist in git history: `06ac827`, `5c48258`, `f62f94b`, `c2c5905`, `f766331`, `f8ca542` — FOUND.
- Full suite (14 files / 83 tests), typecheck, build and `openapi:emit` re-run and passing after the final task commit.
- Generated baseline is gitignored and absent from `git status`.

---
*Phase: 01-platform-foundation-identity*
*Plan: 07*
*Completed: 2026-11-17*
