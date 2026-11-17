---
phase: 01-platform-foundation-identity
fixed_at: 2026-11-17T10:50:12Z
review_path: .planning/phases/01-platform-foundation-identity/01-REVIEW.md
iteration: 1
findings_in_scope: 6
fixed: 6
skipped: 0
status: all_fixed
---

# Phase 01: Code Review Fix Report

**Fixed at:** 2026-11-17T10:50:12Z
**Source review:** .planning/phases/01-platform-foundation-identity/01-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 6 (1 Critical, 5 Warning; 3 Info findings excluded by `fix_scope: critical_warning`)
- Fixed: 6
- Skipped: 0

All fixes were made in an isolated git worktree and committed atomically, one
commit per finding. Verification: full `tsc --noEmit` passed after each fix;
targeted Vitest unit suites and the real-PostgreSQL lifecycle e2e suite were run
where relevant (all passing). Findings that alter concurrency/state-handling
logic are flagged below as requiring human verification of semantic correctness.

## Fixed Issues

### CR-01: Empty authorized-parties list silently disables the `azp` origin check

**Files modified:** `apps/api/src/common/auth/auth.types.ts`, `apps/api/src/common/config/env.validation.ts`, `apps/api/src/common/auth/clerk-token-verifier.ts`
**Commit:** `a9fa936`
**Applied fix:** Added `isValidWebOrigin()` and made `validateEnv()` reject a
`CLERK_WEB_ORIGIN` that parses to zero entries or contains a malformed origin,
raising `ConfigurationError(['CLERK_WEB_ORIGIN'])`. The verifier constructor now
also throws if the parsed allowlist is empty, so an empty array can never reach
`verifyToken()` and skip the `azp` check. The existing `http://localhost:3000`
test/config values remain valid.

### WR-01: `primaryEmail` claim is optional; empty email is provisioned and can overwrite a stored profile

**Files modified:** `apps/api/src/common/auth/clerk-token-verifier.ts`
**Commit:** `5afd58b`
**Applied fix:** A missing/blank `primaryEmail` claim now throws
`ForbiddenException(PROFILE_INCOMPLETE)`, mirroring the `displayName` handling,
instead of producing `''` that could be written on create or overwrite via
`refreshProfile()` on every sign-in.

### WR-02: Concurrent `DELETE /users/me` can overwrite `REVOKED` with `FAILED` in the tombstone

**Files modified:** `apps/api/src/identity/account-lifecycle.repository.ts`, `apps/api/src/identity/account-lifecycle.service.ts`, `apps/api/src/identity/account-lifecycle.service.spec.ts`
**Commit:** `7b666f0`
**Status:** fixed: requires human verification
**Applied fix:** `recordProviderOutcome()` now uses a conditional
`updateMany({ where: { subjectDigest, providerRevocationOutcome: 'PENDING' } })`
and appends the audit event only when exactly one row transitioned, so a losing
request cannot overwrite a terminal outcome or add a contradictory event. Added
`repository.tombstoneFor()`; `finalize()` now reports whether a concurrent
request already recorded `REVOKED`, and `deleteAccount()` skips the provider call
in that case. Unit tests (mock) and the real-PostgreSQL lifecycle e2e suite pass;
concurrency semantics should still be confirmed by a human reviewer.

### WR-03: P2002 swallow reports success without confirming local anonymization

**Files modified:** `apps/api/src/identity/account-lifecycle.service.ts`, `apps/api/src/identity/account-lifecycle.service.spec.ts`
**Commit:** `dfd4b4b`
**Status:** fixed: requires human verification
**Applied fix:** After swallowing a P2002 in `finalize()`, the service re-reads
`currentStatus(userId)` and throws `ConflictException` unless the row is actually
`ANONYMIZED`, preventing a 204 success response (and a provider call) while PII
and a live `clerk_subject` remain. Added unit coverage for both the confirmed and
unconfirmed paths.

### WR-04: Repeated closure requests append duplicate lifecycle audit events

**Files modified:** `apps/api/src/identity/account-lifecycle.repository.ts`, `apps/api/src/identity/account-lifecycle.service.ts`, `apps/api/src/identity/account-lifecycle.service.spec.ts`, `apps/api/src/identity/account-lifecycle.e2e-spec.ts`
**Commit:** `cb7dbd3`
**Status:** fixed: requires human verification
**Applied fix:** `acceptClosure()` now re-checks outstanding obligations inside
the same `$transaction` as its mutations (closing the TOCTOU gap) and returns a
boolean decision; audit events are appended only for transitions whose
`updateMany`/`deleteMany` count is non-zero, so retries no longer duplicate
events. The service falls through to finalization when the atomic re-check finds
obligations resolved. Added a real-PostgreSQL e2e regression test asserting a
repeat closure request adds zero new audit events.

### WR-05: "Permanent" tombstone is invalidated by rotation or loss of a single unvalidated secret

**Files modified:** `apps/api/src/common/config/env.validation.ts`, `apps/api/src/identity/identity.repository.ts`, `apps/api/src/common/database/prisma.service.spec.ts`, `docs/identity/account-deletion.md`
**Commit:** `b6e7f8b`
**Applied fix:** `validateEnv()` now rejects `TOMBSTONE_SECRET` values shorter
than 16 characters or matching a small set of obvious placeholder values, with
`ConfigurationError(['TOMBSTONE_SECRET'])`. Documented in both
`identity.repository.ts` and `docs/identity/account-deletion.md` that the secret
is immutable key material and that rotation requires a key-version migration to
re-hash all tombstones. Added validation unit tests. (Full key-versioning was
not introduced — no schema/migration change — per the "at minimum" option in the
finding.)

## Skipped Issues

None — all in-scope findings were fixed.

The three Info findings were out of scope for `fix_scope: critical_warning` and
were not addressed: IN-01 (documented idempotent 204 unreachable over HTTP),
IN-02 (Clerk issuer/audience not pinned at verification), IN-03 (provider-outcome
audit events not attributable to an account).

---

_Fixed: 2026-11-17T10:50:12Z_
_Fixer: the agent (gsd-code-fixer)_
_Iteration: 1_
