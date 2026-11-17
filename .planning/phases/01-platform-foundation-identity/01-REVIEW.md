---
phase: 01-platform-foundation-identity
reviewed: 2026-11-17T11:04:57Z
depth: standard
files_reviewed: 65
files_reviewed_list:
  - .github/workflows/ci.yml
  - apps/api/.dockerignore
  - apps/api/.env.example
  - apps/api/nest-cli.json
  - apps/api/package.json
  - apps/api/prisma/migrations/0001_identity_foundation/migration.sql
  - apps/api/prisma/schema.prisma
  - apps/api/prisma7.config.ts
  - apps/api/scripts/emit-openapi.cjs
  - apps/api/scripts/test-migrations.sh
  - apps/api/src/app.module.ts
  - apps/api/src/common/auth/auth.module.ts
  - apps/api/src/common/auth/auth.types.ts
  - apps/api/src/common/auth/clerk-auth.guard.ts
  - apps/api/src/common/auth/clerk-token-verifier.ts
  - apps/api/src/common/auth/current-user.decorator.ts
  - apps/api/src/common/auth/is-public.decorator.ts
  - apps/api/src/common/authorization/capability.guard.ts
  - apps/api/src/common/authorization/require-capability.decorator.ts
  - apps/api/src/common/config/env.validation.ts
  - apps/api/src/common/database/prisma.module.ts
  - apps/api/src/common/database/prisma.service.spec.ts
  - apps/api/src/common/database/prisma.service.ts
  - apps/api/src/common/database/schema.spec.ts
  - apps/api/src/common/errors/api-error.ts
  - apps/api/src/common/errors/api-exception.filter.spec.ts
  - apps/api/src/common/errors/api-exception.filter.ts
  - apps/api/src/common/logging/logging.module.ts
  - apps/api/src/common/logging/pino.config.spec.ts
  - apps/api/src/common/logging/pino.config.ts
  - apps/api/src/common/validation/validation.pipe.spec.ts
  - apps/api/src/common/validation/validation.pipe.ts
  - apps/api/src/health/health.controller.ts
  - apps/api/src/health/health.module.ts
  - apps/api/src/health/health.service.ts
  - apps/api/src/health/health.spec.ts
  - apps/api/src/identity/account-lifecycle.e2e-spec.ts
  - apps/api/src/identity/account-lifecycle.repository.ts
  - apps/api/src/identity/account-lifecycle.service.ts
  - apps/api/src/identity/account-lifecycle.types.ts
  - apps/api/src/identity/admin-bootstrap.policy.ts
  - apps/api/src/identity/clerk-account-revocation.service.ts
  - apps/api/src/identity/dto/account-deletion.dto.ts
  - apps/api/src/identity/dto/user-profile.dto.ts
  - apps/api/src/identity/identity.controller.ts
  - apps/api/src/identity/identity.e2e-spec.ts
  - apps/api/src/identity/identity.module.ts
  - apps/api/src/identity/identity.repository.ts
  - apps/api/src/identity/identity.service.ts
  - apps/api/src/identity/identity.types.ts
  - apps/api/src/main.ts
  - apps/api/src/openapi.ts
  - apps/api/src/test/app.e2e-spec.ts
  - apps/api/src/test/fixtures/private-resource.fixture.ts
  - apps/api/src/test/phase-01-acceptance.e2e-spec.ts
  - apps/api/src/test/setup.ts
  - apps/api/tsconfig.build.json
  - apps/api/tsconfig.json
  - apps/api/vitest.config.ts
  - docs/architecture/phase-01-journeys.md
  - docs/identity/account-deletion.md
  - docs/identity/clerk-integration.md
  - docs/operations/local-development.md
  - docs/verification/phase-01-verification.md
  - scripts/verify-phase-01.sh
findings:
  critical: 0
  warning: 0
  info: 3
  total: 3
status: issues_found
---

# Phase 01: Code Review Report (re-review)

**Reviewed:** 2026-11-17T11:04:57Z
**Depth:** standard
**Files Reviewed:** 65
**Status:** issues_found

## Summary

Adversarial re-review of the current Phase 1 platform-foundation and identity
source at standard depth. All 65 listed files were re-read, and the six fix
commits (a9fa936, 5afd58b, dfd4b4b, 7b666f0, cb7dbd3, b6e7f8b) were traced
against the live files.

**Verification of prior Critical/Warning findings — all fixed and holding:**

- **CR-01 (fixed):** `validateEnv()` now rejects an empty/malformed origin
  allowlist via `parseWebOrigins()` + `isValidWebOrigin()`
  (`env.validation.ts:134-137`, `auth.types.ts:72-88`), and the verifier
  constructor has a defence-in-depth non-empty guard
  (`clerk-token-verifier.ts:42-47`). The `azp` check can no longer be silently
  skipped.
- **WR-01 (fixed):** missing/blank `primaryEmail` now throws
  `ForbiddenException(PROFILE_INCOMPLETE)` instead of writing `''`
  (`clerk-token-verifier.ts:85-88`).
- **WR-02 (fixed):** `recordProviderOutcome()` uses a conditional
  `updateMany(... where outcome: PENDING)` and appends at most one outcome event
  (`account-lifecycle.repository.ts:151-184`); `finalize()` skips a second
  provider call when the winner is already `REVOKED`
  (`account-lifecycle.service.ts:107-110`).
- **WR-03 (fixed):** on P2002 the service re-reads `currentStatus()` and throws
  `ConflictException` unless the row is genuinely `ANONYMIZED`
  (`account-lifecycle.service.ts:98-110`).
- **WR-04 (fixed):** `acceptClosure()` performs the obligation check inside the
  mutation transaction and appends events only for rows actually changed; it
  returns `false` when obligations resolved so the caller finalizes
  (`account-lifecycle.repository.ts:68-107`, `account-lifecycle.service.ts:66-74`).
- **WR-05 (fixed):** `validateEnv()` rejects short/weak tombstone secrets via a
  minimum length and a placeholder denylist
  (`env.validation.ts:24-37,142-148`), with rotation risk documented.

No new Critical or Warning defect was proven in the reviewed files. The three
previously reported Info findings were intentionally left unfixed by the owner
and are confirmed still present; they are retained below with their original
IDs. (No structural pre-pass findings were supplied for this phase, so there is
no "Structural Findings (fallow)" section.)

## Narrative Findings (AI reviewer)

## Info

### IN-01: Documented idempotent 204-on-repeat-deletion is an unreachable dead branch

**File:** `apps/api/src/identity/account-lifecycle.service.ts:56-60`, `apps/api/src/identity/identity.service.ts:71-74,82-84`, `docs/identity/account-deletion.md:40-42`
**Issue:** `deleteAccount()` retains the idempotent `ANONYMIZED → 204 ACCOUNT_ANONYMIZED` branch, but the global guard's resolver rejects tombstoned subjects (401) before the controller runs, and finalization clears `clerk_subject`. Any repeat `DELETE /users/me` (or `GET /users/me`) with the same token returns 401, not 204. The branch remains dead code over HTTP and the lifecycle table still documents a behavior clients cannot observe. Confirmed unchanged in the current tree.
**Fix:** Either document replay as 401 and remove the dead branch, or explicitly allow tombstoned subjects to reach `DELETE /users/me` so the idempotent result is real.

### IN-02: Clerk issuer and audience are not pinned at token verification

**File:** `apps/api/src/common/auth/clerk-token-verifier.ts:56-60`
**Issue:** Only `jwtKey` and `authorizedParties` are passed to `verifyToken()`. The SDK's `assertIssuerClaim` / `assertAudienceClaim` are no-ops when `issuer`/`audience` are absent. Signature binding to the instance key keeps practical risk low, but the "fail closed" posture is weaker than documented, and the CR-01 fix did not add these pins. Confirmed unchanged in the current tree.
**Fix:** Pass configured Clerk `issuer` and `audience` values to `verifyToken()` (sourced from validated env/config), e.g. `verifyToken(token, { jwtKey, authorizedParties, issuer: config.clerkIssuer, audience: config.clerkAudience })`.

### IN-03: Provider-outcome audit events are not attributable to an account

**File:** `apps/api/src/identity/account-lifecycle.repository.ts:175-183`
**Issue:** `PROVIDER_REVOCATION_SUCCEEDED`/`FAILED` events are inserted with no `userId` and without the subject digest, so they cannot be joined to the account or tombstone. This weakens the per-account audit trail described in `docs/identity/account-deletion.md:110-118`. Confirmed unchanged in the current tree.
**Fix:** Store `userId` and/or the digest with these events (an added column or a sanitized value in `detail`); `recordProviderOutcome` currently receives only `subjectDigest`, so thread the `userId` through from the service call as well.

---

_Reviewed: 2026-11-17T11:04:57Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
