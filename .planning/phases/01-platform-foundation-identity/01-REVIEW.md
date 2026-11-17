---
phase: 01-platform-foundation-identity
reviewed: 2026-11-17T08:35:51Z
depth: deep
files_reviewed: 41
files_reviewed_list:
  - apps/api/src/main.ts
  - apps/api/src/app.module.ts
  - apps/api/src/openapi.ts
  - apps/api/src/common/config/env.validation.ts
  - apps/api/src/common/database/prisma.service.ts
  - apps/api/src/common/database/prisma.module.ts
  - apps/api/src/common/auth/auth.types.ts
  - apps/api/src/common/auth/auth.module.ts
  - apps/api/src/common/auth/clerk-token-verifier.ts
  - apps/api/src/common/auth/clerk-auth.guard.ts
  - apps/api/src/common/auth/current-user.decorator.ts
  - apps/api/src/common/auth/is-public.decorator.ts
  - apps/api/src/common/authorization/capability.guard.ts
  - apps/api/src/common/authorization/require-capability.decorator.ts
  - apps/api/src/common/validation/validation.pipe.ts
  - apps/api/src/common/errors/api-error.ts
  - apps/api/src/common/errors/api-exception.filter.ts
  - apps/api/src/common/logging/pino.config.ts
  - apps/api/src/common/logging/logging.module.ts
  - apps/api/src/health/health.controller.ts
  - apps/api/src/health/health.service.ts
  - apps/api/src/health/health.module.ts
  - apps/api/src/identity/identity.types.ts
  - apps/api/src/identity/identity.repository.ts
  - apps/api/src/identity/identity.service.ts
  - apps/api/src/identity/admin-bootstrap.policy.ts
  - apps/api/src/identity/identity.controller.ts
  - apps/api/src/identity/identity.module.ts
  - apps/api/src/identity/dto/user-profile.dto.ts
  - apps/api/src/identity/dto/account-deletion.dto.ts
  - apps/api/src/identity/account-lifecycle.types.ts
  - apps/api/src/identity/account-lifecycle.repository.ts
  - apps/api/src/identity/account-lifecycle.service.ts
  - apps/api/src/identity/clerk-account-revocation.service.ts
  - apps/api/prisma/schema.prisma
  - apps/api/prisma/migrations/0001_identity_foundation/migration.sql
  - apps/api/prisma7.config.ts
  - apps/api/scripts/test-migrations.sh
  - apps/api/scripts/emit-openapi.cjs
  - scripts/verify-phase-01.sh
  - .github/workflows/ci.yml
findings:
  critical: 0
  warning: 3
  info: 1
  total: 4
status: issues
---

# Phase 01: Code Review Report

**Reviewed:** 2026-11-17T08:35:51Z
**Depth:** deep
**Files Reviewed:** 41
**Status:** issues

## Summary

I reviewed the full implementation delivered across plans 01-01 through 01-09: the pnpm/Vite+ workspace, NestJS API request boundary (validation, error envelope, redacted Pino logging, honest health probes), Prisma 7.10.1 schema/migration, networkless Clerk verification behind a deny-by-default guard, race-safe local provisioning and admin bootstrap, capability guard + `/users/me` + OpenAPI baseline, the staged-closure/tombstone/fail-closed-revocation account lifecycle, and the CI/acceptance/journey/verification closure. I cross-referenced the implementation against the owner resolutions in `PROJECT.md` (Key Decisions, 2026-11-17), `01-CONTEXT.md`, all nine plan summaries, and the coding/testing conventions.

The security-critical path is sound in the ways that matter most: verification is networkless SDK-only, the tombstone is a keyed HMAC written atomically with anonymization and checked before provisioning, denial fails closed on provider error, authorization reads only guard-resolved local state, and ownership/retention invariants live in the database. I found no authentication bypass, injection, raw-PII-in-tombstone/log leak, or data-loss defect.

Findings are concentrated in the account-lifecycle area and are contract/correctness-quality issues rather than exploitable security holes: a documented lifecycle state that no code ever enters, a provider-revocation "retry" that is not durable despite the docs promising it, and duplicate/dead audit events on repeated deletion requests. Tests pass as reported (110 tests); no test-only defect rises to the level of a finding.

## Warnings

### WR-01: Documented `CLOSURE_REQUESTED` lifecycle state is never entered; contract describes a two-step flow the code does not implement

**File:** `docs/identity/account-deletion.md:22-31` and `apps/api/src/identity/account-lifecycle.repository.ts:49-71`
**Issue:** The public contract documents a distinct request→accept sequence — users `ACTIVE → CLOSURE_REQUESTED → CLOSURE_ACCEPTED → ANONYMIZED` and stores `ACTIVE → CLOSURE_REQUESTED → CLOSED` — and its outcome table lists a caller state of `CLOSURE_REQUESTED`. No code path ever sets `users.lifecycle_status` or `stores.status` to `CLOSURE_REQUESTED`. `AccountLifecycleRepository.acceptClosure()` transitions directly from `ACTIVE` (or the never-reached `CLOSURE_REQUESTED`) to `CLOSURE_ACCEPTED`/`CLOSED`. The `LifecycleEventType.CLOSURE_REQUESTED` audit row is emitted at *accept* time (line 66), not at a separate request time, so it does not represent the documented intermediate state. The one-shot `DELETE /users/me` collapses "request" and "accept" into a single call. Result: the contract shown to reviewers/consumers describes states and transitions that do not exist, and `CLOSURE_REQUESTED` is dead in both the user and store enums.
**Fix:** Align the contract and implementation. Either (a) collapse the documentation to the actual one-step flow (remove the `CLOSURE_REQUESTED` state and pre-accept request step from both diagrams and the outcome table, and note that request+accept are atomic), or (b) implement a real first-step request operation that sets `CLOSURE_REQUESTED` on the user/store and move the `CLOSURE_REQUESTED` event into it. Option (a) matches the current design intent and the plan's delegated "exact state names/authorization" latitude; do not leave a documented state that no code can produce.

### WR-02: Provider (Clerk) revocation "retry" is not durable and has no backoff; docs promise a retry that never happens after the 409

**File:** `apps/api/src/identity/clerk-account-revocation.service.ts:59-83`, `apps/api/src/identity/account-lifecycle.service.ts:47-52`, `docs/identity/account-deletion.md:145,150`
**Issue:** `revoke()` makes three immediate `deleteUser` calls with no delay/backoff, then records `FAILED` and returns. There is no durable retry: a later `DELETE /users/me` returns early at `deleteAccount()` for an already-`ANONYMIZED` user and never re-attempts provider revocation. If the process crashes after the local commit but before `recordProviderOutcome()`, the tombstone stays `PENDING` with no audit event and no re-attempt. The 409 response's documented meaning ("provider revocation failed and will be retried"; "retryable and reportable") is therefore inaccurate — nothing retries once the request ends. Local denial is authoritative and fail-closed, so this is not an access-control failure, but a persistent provider outage (or a crash in the window) leaves the Clerk account active indefinitely, only partially satisfying the owner's "the failure must be surfaced and retried" resolution.
**Fix:** Either implement an operational retry path (a revoke endpoint/job or an explicit "retry provider revocation" branch that, for a tombstoned subject with `PENDING`/`FAILED` outcome, re-invokes `revoke()` on a subsequent authorized trigger), and correct the lifecycle service so the ANONYMIZED early-return does not preclude it; or, if durable retry is intentionally out of scope, change the docs and 409 description to state that retries are limited to the three in-request attempts and that provider cleanup is a manual/operational follow-up. Add at least a short bounded backoff between in-request attempts so a transient rate-limit (429) is not burned instantly.

### WR-03: Repeated staged-closure DELETE requests append duplicate lifecycle events and never emit `OBLIGATIONS_RESOLVED`

**File:** `apps/api/src/identity/account-lifecycle.repository.ts:49-71`, `apps/api/src/identity/account-lifecycle.service.ts:58-62`, `apps/api/prisma/schema.prisma:56-67`
**Issue:** When obligations remain, `deleteAccount()` unconditionally calls `acceptClosure()` and returns 202. `acceptClosure()`'s `updateMany` calls become no-ops once the user is `CLOSURE_ACCEPTED` and stores are `CLOSED`, but its `lifecycleEvent.createMany(...)` (lines 64-70) is unconditional, so every repeat request appends another `CLOSURE_REQUESTED`, `CLOSURE_ACCEPTED` and `CAPABILITY_REVOKED` (ADMIN) event. The audit trail thus misrepresents how many closure decisions occurred. Separately, `LifecycleEventType.OBLIGATIONS_RESOLVED` (and `PROVIDER_REVOCATION_ATTEMPTED`) are defined in the schema but never written by any code path — finalization emits only `PROFILE_ANONYMIZED`/`CAPABILITY_REVOKED`/`TOMBSTONE_WRITTEN`, so there is no audit record that obligations actually resolved before anonymization.
**Fix:** Make `acceptClosure()` idempotent: detect the current status first (or use the `count` from the conditional `updateMany`) and emit closure events only on the genuine `ACTIVE → CLOSURE_ACCEPTED` transition. Write an `OBLIGATIONS_RESOLVED` event at the point finalization is triggered (when `hasOutstandingObligations` is confirmed false for a previously staged user), and either emit `PROVIDER_REVOCATION_ATTEMPTED` per attempt or remove the unused enum values from the schema/migration if they are not part of the contract.

## Info

### IN-01: 409 deletion response uses a different body shape from the global error envelope

**File:** `apps/api/src/identity/identity.controller.ts:80-84`
**Issue:** All errors produced through `ApiExceptionFilter` use the `ApiErrorBody` envelope (`statusCode`/`code`/`message`/`requestId`), but the 409 `PROVIDER_REVOCATION_FAILED` path is written directly via `response.status(409).json(AccountDeletionResultDto)`, yielding `{ code, lifecycleStatus }`. A client handling 409 uniformly therefore sees two incompatible shapes depending on the error's origin. This is intentional per the plan's "stable codes" decision, but it is undocumented as an exception in the API contract and is a client-side trap.
**Fix:** Document the 409 body explicitly as `AccountDeletionResultDto` in the OpenAPI baseline (already declared via `@ApiResponse`) and note in the client-facing contract that deletion 409 is a structured, non-envelope response; alternatively carry the deletion code through the standard envelope's `code` field so all errors share one shape.

---

_Reviewed: 2026-11-17T08:35:51Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: deep_
