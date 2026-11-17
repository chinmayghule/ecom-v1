---
status: partial
phase: 01-platform-foundation-identity
source: [01-VERIFICATION.md]
started: 2026-11-17T08:41:01.000Z
updated: 2026-11-17T09:15:00.000Z
---

## Current Test

[awaiting owner's live Clerk dashboard check — item 1]

## Tests

### 1. Live Clerk dashboard configuration matches the documented contract
expected: Clerk instance requires email + a required display-name field at signup; email verification enabled; the three signed session claims (primaryEmail, displayName, emailVerified) are emitted; authorized parties match CLERK_WEB_ORIGIN
result: [pending — owner-only manual check; exact steps in docs/identity/clerk-integration.md → "Live Clerk verification procedure"]

### 2. Browser sign-up, sign-in, session persistence across browser sessions, and sign-out
expected: A visitor can register/sign in through the Clerk UI, remain signed in across browser sessions, and sign out
result: [deferred to Phase 5 — no browser UI exists in Phase 1. The API token/claims contract and full authenticated lifecycle were verified over live HTTP with a signed token; see docs/verification/phase-01-verification.md]

### 3. Docker Compose runtime smoke (docker compose build api && docker compose up -d --wait)
expected: The pinned API image builds and the API+PostgreSQL stack reaches health-gated readiness with one command
result: [PASS 2026-11-17 — clean --no-cache build, both services healthy, migrations applied before serving, live health/401 probes. Two real defects found and fixed. See docs/verification/phase-01-verification.md]

## Additional evidence (2026-11-17)

Live authenticated API flow (throwaway locally signed RS256 token, no real credentials):
- GET /users/me → 200, provisioned CUSTOMER+ADMIN; repeat → 200 same id (no duplicate)
- DELETE /users/me → 409 PROVIDER_REVOCATION_FAILED, lifecycleStatus ANONYMIZED (fail-closed with placeholder Clerk config)
- GET /users/me reusing the still-valid token → 401 (keyed tombstone denies deleted subject)
- DB: personal fields NULL, HMAC-only tombstone (no raw subject, permanent), capabilities revoked, correct lifecycle events
- Full gate pnpm run verify:phase-01 → exit 0 (twice), 18 files / 110 tests

## Summary

total: 3
passed: 1
issues: 0
pending: 1
skipped: 1
blocked: 0

## Gaps
EOF