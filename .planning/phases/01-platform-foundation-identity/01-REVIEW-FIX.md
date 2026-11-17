---
phase: 01-platform-foundation-identity
fixed_at: 2026-11-17T11:17:31Z
review_path: .planning/phases/01-platform-foundation-identity/01-REVIEW.md
iteration: 1
findings_in_scope: 3
fixed: 3
skipped: 0
status: all_fixed
---

# Phase 01: Code Review Fix Report

**Fixed at:** 2026-11-17T11:17:31Z
**Source review:** .planning/phases/01-platform-foundation-identity/01-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 3 (run was `--fix --all`; all three REVIEW.md findings are Info severity)
- Fixed: 3
- Skipped: 0

All three retained Info findings from the re-review were fixed and committed
atomically. Verification after each fix: `pnpm run typecheck` (clean) plus the
relevant Vitest specs; the full API suite was also run once after the final fix
(18 files / 114 tests passing).

## Fixed Issues

### IN-01: Documented idempotent 204-on-repeat-deletion is an unreachable dead branch

**Files modified:** `apps/api/src/identity/account-lifecycle.service.ts`, `apps/api/src/identity/account-lifecycle.service.spec.ts`, `docs/identity/account-deletion.md`
**Commit:** `2f965fa`
**Applied fix:** Removed the unreachable top-of-method `currentStatus() === ANONYMIZED -> 204` branch from `deleteAccount()`. Replay is genuinely 401 (the global guard rejects the tombstoned subject and finalization clears `clerk_subject`); the only remaining idempotent path is the concurrent-deletion conflict inside `finalize()`, which still returns 204. Updated the two unit tests that relied on the removed check consuming the first `currentStatus` mock, and corrected the account-deletion doc (outcome table + retry/conflict table) to state that repeat deletion returns 401 rather than an idempotent 204.

### IN-02: Clerk issuer and audience are not pinned at token verification

**Files modified:** `apps/api/src/common/config/env.validation.ts`, `apps/api/src/common/auth/clerk-token-verifier.ts`, `apps/api/src/common/auth/clerk-token-verifier.spec.ts`, plus all env-configuration points (`apps/api/.env.example`, `apps/api/src/test/setup.ts`, `apps/api/scripts/emit-openapi.cjs`, `apps/api/src/common/database/prisma.service.spec.ts`, `apps/api/src/health/health.spec.ts`, `apps/api/src/identity/identity.service.spec.ts`, `apps/api/src/identity/account-lifecycle.e2e-spec.ts`, `apps/api/src/identity/identity.e2e-spec.ts`, `apps/api/src/test/phase-01-acceptance.e2e-spec.ts`, `.github/workflows/ci.yml`, `compose.yaml`, `scripts/verify-phase-01.sh`, `docs/identity/clerk-integration.md`, `docs/operations/local-development.md`)
**Commit:** `8479ce4`
**Applied fix:** Added required, validated `CLERK_ISSUER` (must be an http(s) URL) and `CLERK_AUDIENCE` (non-empty) env values to `AppConfig` / `validateEnv()`, stored them on `ClerkTokenVerifierService`, and passed both as `issuer`/`audience` to `@clerk/backend` `verifyToken()` so those claims are enforced on every request (previously no-op checks). Confirmed against the installed SDK source that `verifyToken` forwards these options to `verifyJwt`'s assertion path. Updated every env setup point and added negative tests for wrong issuer and wrong audience (both now yield sanitized 401). Note for deployment: the live Clerk instance's real `iss`/`aud` values must be set in `CLERK_ISSUER`/`CLERK_AUDIENCE`; placeholders are used in tests/CI/local defaults.

### IN-03: Provider-outcome audit events are not attributable to an account

**Files modified:** `apps/api/src/identity/account-lifecycle.repository.ts`, `apps/api/src/identity/clerk-account-revocation.service.ts`, `apps/api/src/identity/account-lifecycle.service.ts`, `apps/api/src/identity/account-lifecycle.types.ts`, `apps/api/src/identity/account-lifecycle.service.spec.ts`, `apps/api/src/identity/clerk-account-revocation.service.spec.ts`, `apps/api/src/identity/account-lifecycle.e2e-spec.ts`, `docs/identity/account-deletion.md`
**Commit:** `a3a3dd4`
**Applied fix:** Threaded the stable, non-PII local `userId` from `AccountLifecycleService.deleteAccount()` through the `ProviderRevocation.revoke()` port and `ClerkAccountRevocationService.record()` into `recordProviderOutcome()`, which now sets `userId` on the appended `PROVIDER_REVOCATION_SUCCEEDED`/`FAILED` event. This uses the existing nullable `user_id` column and a plain INSERT, so it respects the append-only `lifecycle_events` trigger (no UPDATE/DELETE, no new column, no migration). No raw Clerk subject or subject digest is written to the event log; `detail` still holds only the sanitized error class. Updated unit/e2e stubs and added assertions that the userId reaches the recorder and the event.

## Skipped Issues

None — all in-scope findings were fixed.

---

_Fixed: 2026-11-17T11:17:31Z_
_Fixer: the agent (gsd-code-fixer)_
_Iteration: 1_
