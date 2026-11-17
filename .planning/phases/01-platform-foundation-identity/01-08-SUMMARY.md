---
phase: 01-platform-foundation-identity
plan: 08
subsystem: identity
tags: [account-deletion, staged-closure, tombstone, hmac, clerk, revocation, anonymization, retention, nestjs, prisma, supertest]

# Dependency graph
requires:
  - phase: 01-03
    provides: "Binding owner resolutions: staged-closure and keyed-permanent-tombstone-local-first (2026-11-17)"
  - phase: 01-04
    provides: "Lifecycle states, keyed tombstone table, append-only audit and ON DELETE RESTRICT retention"
  - phase: 01-06
    provides: "subjectDigestFor() HMAC, deny-by-default guard and tombstone pre-provision denial"
  - phase: 01-07
    provides: "Thin IdentityController, @CurrentUser boundary and the single OpenAPI assembler"
provides:
  - "Transactional staged closure and anonymization preserving stable local ids and all store/order references"
  - "Permanent keyed HMAC tombstone written in the same transaction as anonymization, with no raw PII"
  - "Fail-closed, retrying Clerk provider revocation recorded against the tombstone"
  - "Self-only DELETE /users/me returning 204 / 202 / 409 with stable non-sensitive codes"
  - "Real-PostgreSQL evidence and an operational retention/deletion contract"
affects:
  - "Plan 01-09 (acceptance suite reuses deletion/closure proofs), Phase 2+ (order/refund state machines consume the retained obligation fields), Phase 4 (OpenAPI contract freeze adds the DELETE path)"

# Tech tracking
tech-stack:
  added:
    - "AccountLifecycleService / AccountLifecycleRepository with Prisma interactive transactions"
    - "ClerkAccountRevocationService using @clerk/backend 3.29.0 createClerkClient().users.deleteUser"
    - "ProviderRevocation injection port (PROVIDER_REVOCATION token) for local-first orchestration"
    - "AccountDeletionRequestDto / AccountDeletionResultDto with stable 204/202/409 outcome codes"
  patterns:
    - "Local commit first, provider revocation after; a provider failure never restores access or rolls back anonymization"
    - "Keyed HMAC-SHA256 subject digest (subjectDigestFor) is the only deleted-subject marker; no raw Clerk subject is persisted or logged"
    - "Staged closure keeps CLOSURE_ACCEPTED merchants authenticated for restricted completion; only ANONYMIZED identities are denied locally"
    - "Each TDD task commits RED (test) before GREEN (feat) on the main tree with hooks enabled"

key-files:
  created:
    - apps/api/src/identity/account-lifecycle.types.ts
    - apps/api/src/identity/account-lifecycle.repository.ts
    - apps/api/src/identity/account-lifecycle.service.ts (+ spec)
    - apps/api/src/identity/clerk-account-revocation.service.ts (+ spec)
    - apps/api/src/identity/dto/account-deletion.dto.ts
    - apps/api/src/identity/account-lifecycle.e2e-spec.ts
    - docs/identity/account-deletion.md
  modified:
    - apps/api/src/identity/identity.controller.ts
    - apps/api/src/identity/identity.module.ts
    - apps/api/src/identity/identity.service.ts
key-decisions:
  - "Owner-selected staged closure implemented exactly: no obligations -> immediate single-transaction anonymization; obligations -> CLOSURE_ACCEPTED + stores CLOSED, restricted MERCHANT completion retained, anonymization deferred until obligations resolve"
  - "Permanent keyed HMAC tombstone (expires_at NULL) is written in the same transaction as anonymization and is authoritative; no raw Clerk subject, email or PII is stored and no legal retention duration is invented"
  - "Provider revocation is attempted after the local commit with a bounded 3-attempt retry; failures record a sanitized stable error class and return 409 while local access stays denied"
  - "DELETE /users/me derives the target only from @CurrentUser and rejects all client-supplied identity/role fields via the global validation boundary"
  - "Staged-closure states (CLOSURE_REQUESTED / CLOSURE_ACCEPTED) may authenticate so merchants retain restricted completion; ANONYMIZED identities and keyed-tombstoned subjects are denied"
requirements-completed: [AUTH-06, OPS-01]

# Metrics
duration: 12min
completed: 2026-11-17
started: 2026-11-17T07:58:35Z
---

# Phase 1 Plan 8: Account Deletion, Staged Closure and Tombstone Denial Summary

**Owner-approved irreversible account lifecycle: transactional anonymization with a permanent keyed HMAC deny marker, staged merchant closure with retained order/store integrity, and fail-closed Clerk revocation behind a self-only deletion endpoint.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-11-17T07:58:35Z
- **Completed:** 2026-11-17T08:10:06Z
- **Tasks:** 3 of 3 (each TDD RED -> GREEN)
- **Files modified:** 12 (11 plan files + `identity.service.ts` adjustment) + this SUMMARY

## Accomplishments

- Built `AccountLifecycleService` + `AccountLifecycleRepository`. With no outstanding obligations, one Prisma interactive transaction sets `lifecycleStatus = ANONYMIZED`, clears `email`/`display_name`/`clerk_subject` to NULL, removes the explicit `ADMIN` capability, inserts the keyed permanent tombstone and appends lifecycle audit events — without deleting the user or any store/order. With in-flight obligations (buyer or store owner), it accepts staged closure: user -> `CLOSURE_ACCEPTED`, owned stores -> `CLOSED`, `MERCHANT` capability retained for restricted completion, no early anonymization and no tombstone. Re-invoking after obligations resolve finalizes the deletion.
- Built `ClerkAccountRevocationService` on the official `@clerk/backend` `users.deleteUser`, injected behind a `PROVIDER_REVOCATION` port. It runs after the local commit, retries up to 3 attempts, records `REVOKED`/`FAILED` with attempt count, revocation time and a sanitized stable error class, and never throws or restores local access. No secret, token, subject or raw provider message is logged.
- Added `DELETE /users/me` to the existing thin controller. It derives the target only from `@CurrentUser`, rejects client identity/role fields through the global validation boundary, and returns 204 (anonymized), 202 (`CLOSURE_ACCEPTED`) or 409 (`PROVIDER_REVOCATION_FAILED`) with only a stable code and non-sensitive lifecycle status. Wired all new providers in `IdentityModule` and extended the single OpenAPI surface (no duplicate document source or guard).
- Added real-PostgreSQL e2e proofs and `docs/identity/account-deletion.md` with all eight required sections, the lifecycle table, exact anonymized/retained fields, tombstone and provider contract, restricted merchant actions, retry/conflict responses and an explicit statement that no legal retention period is implemented.

## Verification Evidence (commands actually run)

| Command | Result |
|---------|--------|
| `pnpm --filter @ecom-v1/api test -- src/identity/account-lifecycle.service.spec.ts` | RED: 1 failed (missing module); GREEN: PASS — 15 files / 89 tests |
| `pnpm --filter @ecom-v1/api test -- src/identity/clerk-account-revocation.service.spec.ts` | RED: 1 failed (missing module); GREEN: PASS — 16 files / 93 tests |
| `pnpm --filter @ecom-v1/api test -- src/identity/account-lifecycle.e2e-spec.ts` | RED: 3 failed (missing doc + 2 real-guard expectations); GREEN: PASS — 17 files / 99 tests |
| `pnpm --filter @ecom-v1/api test` (full suite) | PASS — 17 files, 99 tests, 0 skipped (baseline was 14 files / 83 tests) |
| `pnpm --filter @ecom-v1/api typecheck` | PASS (strict TS 6) |
| `pnpm --filter @ecom-v1/api build` | PASS (`nest build`) |
| Doc-section greps (`Tombstone`, `Provider revocation`, `Anonymized fields`) | FOUND |
| Stub / raw-subject / secret-log scan | No product stubs, no raw Clerk subject, no secret emission in new source |

**Environment note:** no Docker daemon is available here, so the real-PostgreSQL e2e used the same disposable `initdb`/`pg_ctl` cluster plus the committed migration as Plans 01-04/01-06/01-07. No Docker-based pass is claimed. Provider revocation is exercised through an injected Clerk client seam; no live Clerk call was made and no credential was used.

## Task Commits

Each task was committed atomically on the main working tree with hooks enabled (no `--no-verify`), RED before GREEN:

1. **Task 1: owner-selected local lifecycle transaction** — `11f0813` (test), `5dabe2e` (feat)
2. **Task 2: Clerk revocation orchestration + self-deletion endpoint** — `accd647` (test), `cb2edf9` (feat)
3. **Task 3: retention/closure/tombstone e2e + documentation** — `29194a8` (test), `7d77f4c` (feat)

TDD gates verified in git log: a `test(01-08)` commit precedes each `feat(01-08)` commit. No refactor commit was needed.

## Files Created/Modified

- `apps/api/src/identity/account-lifecycle.types.ts` — derived lifecycle statuses, in-flight obligation set, deletion codes, provider port.
- `apps/api/src/identity/account-lifecycle.repository.ts` — obligation assessment and the atomic closure/anonymization/tombstone writes.
- `apps/api/src/identity/account-lifecycle.service.ts` (+ spec) — staged-closure decision, local-first orchestration, fail-closed provider outcome.
- `apps/api/src/identity/clerk-account-revocation.service.ts` (+ spec) — retrying Clerk `deleteUser` with sanitized outcome recording.
- `apps/api/src/identity/dto/account-deletion.dto.ts` — no-input request DTO and stable-outcome response DTO.
- `apps/api/src/identity/identity.controller.ts` — added self-only `DELETE /users/me`.
- `apps/api/src/identity/identity.module.ts` — lifecycle + revocation provider wiring and port binding.
- `apps/api/src/identity/identity.service.ts` — staged-closure states may authenticate (see Deviations).
- `apps/api/src/identity/account-lifecycle.e2e-spec.ts` — real-Postgres retention/closure/tombstone/ownership/failure proofs.
- `docs/identity/account-deletion.md` — operational and retention contract.

## Decisions Made

- An "outstanding obligation" is an in-flight order (`PENDING_PAYMENT`/`PAID`/`SHIPPED`) where the user is buyer or store owner; terminal orders are retained references only. This is the sole anonymization trigger, matching D-08.
- The tombstone is written only at final anonymization (not at closure acceptance), so a staged-closure merchant can still authenticate for restricted completion. The copied-token denial guarantee holds because the tombstone is written with anonymization and checked before provisioning.
- A duplicate tombstone digest is treated as an already-denied subject; provider revocation is retried, and no second local user can be created.
- No legal retention duration, reopen rule or new lifecycle state was added — all were explicitly delegated and no value was supplied.

## Auth Gates

None. No authentication or package-legitimacy gate arose; no packages were installed (all dependencies were already pinned in `DEPENDENCIES.md`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Staged-closure merchants were denied authentication by the existing guard resolver**
- **Found during:** Task 3 e2e verification (second deletion call on a `CLOSURE_ACCEPTED` merchant returned 401).
- **Issue:** Plan 06's `IdentityService.resolveVerifiedIdentity` denied every `lifecycleStatus !== 'ACTIVE'` user. That blocks the owner-mandated staged-closure outcome, which requires the merchant to keep restricted completion/refund access until obligations resolve.
- **Fix:** Deny only `ANONYMIZED` identities (in all three status checks); `CLOSURE_REQUESTED` and `CLOSURE_ACCEPTED` may authenticate. The keyed tombstone check still runs first, so deleted subjects remain denied. No behavior for `ANONYMIZED` or tombstoned subjects was relaxed.
- **Files modified:** `apps/api/src/identity/identity.service.ts`
- **Verification:** full suite re-run PASS (17 files / 99 tests), including the copied-token 401 and staged-closure finalization tests.
- **Committed in:** `7d77f4c`

### Implementation details needed to satisfy the plan

- The plan's `<files>` lists for Tasks 1–3 do not include `identity.service.ts`; the one change above was required by the owner resolution and is documented rather than hidden.
- The revocation service is consumed by the lifecycle service through a `PROVIDER_REVOCATION` port defined in `account-lifecycle.types.ts` and bound in `identity.module.ts` (rather than a direct class import). This keeps each TDD task's commits independently buildable while preserving the planned `revoke`/`deleteUser` link.
- Two Task 3 e2e expectations were corrected during GREEN (test-only): the guard refreshes the profile copy from the verified token so the staged-closure email value is provider-derived (asserted non-null, not a fixed literal), and the in-flight order was re-pointed to a dedicated buyer so the cross-user test subject has no obligations.
- `AccountDeletionRequestDto.userId` is typed `string` with `@IsEmpty()`/`@IsOptional()` rather than `never`: Swagger's reflection could not resolve a `never` property type, producing a circular-dependency error at OpenAPI build time. Validation still rejects any supplied value at the boundary.

**Total deviations: 1 auto-fix (Rule 2) + 4 implementation/test notes. No scope, dependency-pin or product-policy change; no legal retention period invented.**

## Known Stubs

None. The only "placeholder" strings are deterministic, non-secret test environment values in the e2e spec; no TODO/FIXME, empty placeholder data or unwired data source was introduced. Nullable profile fields are contract-required anonymization states, not stubs.

## Threat Flags

None. New surfaces — the `DELETE /users/me` endpoint, the Clerk `deleteUser` backend call, the provider outcome fields and the lifecycle audit events — are all in the plan's STRIDE register T-08-01..T-08-07 and are covered by code, tests and documentation. No new network endpoint, auth path, file access pattern or schema change was added.

## Next Phase Readiness

- Plan 01-09 can include deletion/closure, replay-denial and retention checks in the phase acceptance suite using the e2e proofs here.
- Later order/refund modules can consume the in-flight/terminal obligation fields to finalize staged closures; they must not introduce a timed anonymization job without a recorded owner decision.
- Phase 4's OpenAPI freeze will add the new `/users/me` DELETE path from the single assembler; no duplicate document source was created here.

## Self-Check: PASSED

- Verified all 12 implementation files exist (11 plan files + `identity.service.ts`), plus this SUMMARY.
- Verified all six task commits exist in git history: `11f0813`, `5dabe2e`, `accd647`, `cb2edf9`, `29194a8`, `7d77f4c` — all FOUND.
- Full suite (17 files / 99 tests), typecheck, build and doc greps re-run and passing after the final task commit.

---
*Phase: 01-platform-foundation-identity*
*Plan: 08*
*Completed: 2026-11-17*
