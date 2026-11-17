---
status: partial
phase: 01-platform-foundation-identity
source: [01-VERIFICATION.md]
started: 2026-11-17T08:41:01.000Z
updated: 2026-11-17T08:41:01.000Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Live Clerk dashboard configuration matches the documented contract
expected: Clerk instance requires email + a required display-name field at signup; email verification enabled; the three signed session claims (primaryEmail, displayName, emailVerified) are emitted; authorized parties match CLERK_WEB_ORIGIN
result: [pending]

### 2. Browser sign-up, sign-in, session persistence across browser sessions, and sign-out
expected: A visitor can register/sign in through the Clerk UI, remain signed in across browser sessions, and sign out
result: [pending]

### 3. Docker Compose runtime smoke (docker compose build api && docker compose up -d --wait)
expected: The pinned API image builds and the API+PostgreSQL stack reaches health-gated readiness with one command
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
