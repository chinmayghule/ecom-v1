---
status: partial
phase: 01-platform-foundation-identity
source: [01-VERIFICATION.md, 01-REVIEW.md, 01-REVIEW-FIX.md]
started: 2026-11-17T08:41:01.000Z
updated: 2026-11-17T11:41:44.000Z
---

## Current Test

[testing paused — 1 item blocked on Phase 5, 1 item deferred to Phase 5]

## Tests

### 1. Live Clerk dashboard configuration matches the documented contract
expected: Clerk instance requires email + a required display-name field at signup; email verification enabled; the three signed session claims (primaryEmail, displayName, emailVerified) are emitted; authorized parties match CLERK_WEB_ORIGIN
result: blocked
blocked_by: prior-phase
reason: "The repository is not connected to any Clerk Dashboard application. Verified 2026-11-17: no .clerk/ directory, no keyless.json, no .env — only apps/api/.env.example with non-secret placeholders. The application app_3MEIvVe9nrCDEpEgpRgqpAGEW9a exists in the owner's Dashboard but is not linked to ecom-v1, so there is no live configuration to inspect for this project yet. The Dashboard-hosted sign-in surface and the repo-to-app link are Phase 5 deliverables (apps/web + Clerk CLI init --app / link + env pull). The live check must be performed then, against the connected app."
note: "This is a manual-only configuration check; no repository CLI can assert Dashboard state. Procedure: docs/identity/clerk-integration.md → 'Live Clerk verification procedure'. Also required once connected: set CLERK_ISSUER and CLERK_AUDIENCE to the live instance's real values (added by review fix IN-02, commit 8479ce4). Display name is a required custom field / {{user.full_name}}, NOT a username."

### 2. Browser sign-up, sign-in, session persistence across browser sessions, and sign-out
expected: A visitor can register/sign in through the Clerk UI, remain signed in across browser sessions, and sign out
result: blocked
blocked_by: prior-phase
reason: "Deferred to Phase 5 — no browser UI exists in Phase 1. The API token/claims contract and full authenticated lifecycle were verified over live HTTP with a signed token; see docs/verification/phase-01-verification.md."

### 3. Docker Compose runtime smoke (docker compose build api && docker compose up -d --wait)
expected: The pinned API image builds and the API+PostgreSQL stack reaches health-gated readiness with one command
result: pass
reason: "PASS 2026-11-17 — clean --no-cache build, both services healthy, migrations applied before serving, live health/401 probes. Two real defects found and fixed. See docs/verification/phase-01-verification.md."

## Additional evidence (2026-11-17)

Live authenticated API flow (throwaway locally signed RS256 token, no real credentials):
- GET /users/me → 200, provisioned CUSTOMER+ADMIN; repeat → 200 same id (no duplicate)
- DELETE /users/me → 409 PROVIDER_REVOCATION_FAILED, lifecycleStatus ANONYMIZED (fail-closed with placeholder Clerk config)
- GET /users/me reusing the still-valid token → 401 (keyed tombstone denies deleted subject)
- DB: personal fields NULL, HMAC-only tombstone (no raw subject, permanent), capabilities revoked, correct lifecycle events
- Full gate pnpm run verify:phase-01 → exit 0 (twice), 18 files / 110 tests

## Post-review state (2026-11-17)

- Code review and fixes were completed in a separate session: `01-REVIEW-FIX.md` records `status: all_fixed` (3 Info findings IN-01..IN-03, on top of earlier WR-01..WR-05 and CR-01 fixes), final commit `76d1ba7`.
- Fix verification so far: `pnpm run typecheck` plus relevant Vitest specs after each fix, and the full API suite once after the final fix (18 files / 114 tests).
- **Outstanding:** the full gate `pnpm run verify:phase-01` has NOT been re-run after the review fixes, and is a precondition for `/gsd-verify-work` (`.planning/phases/01-platform-foundation-identity/01-VALIDATION.md:42`). It must be green before verification resumes.
- Owner workflow preference: per-phase UAT files are generated only after all Stage 1 implementation phases are complete; the owner will test them in one dedicated session afterward. This file remains the human-only record and is not resumed in the meantime (recorded in `.planning/STATE.md`).

## Summary

total: 3
passed: 1
issues: 0
pending: 0
skipped: 0
blocked: 2

## Gaps

[none — blocked items are prerequisite gates, not code issues]
