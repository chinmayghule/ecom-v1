---
phase: 01-platform-foundation-identity
plan: 06
subsystem: identity
tags: [clerk, nestjs, verification, guard, rbac, postgresql, prisma, tombstone, admin-bootstrap, cors]

# Dependency graph
requires:
  - phase: 01-02
    provides: "Pinned NestJS 12 / strict TS 6 API workspace and the single Vitest/Supertest harness"
  - phase: 01-03
    provides: "Owner resolution keyed-permanent-tombstone-local-first for deny markers"
  - phase: 01-04
    provides: "Unique clerk_subject constraint, capability rows and the keyed IdentityTombstone table"
  - phase: 01-05
    provides: "IS_PUBLIC_KEY metadata, global validation/error boundary and redacted Pino logging"
provides:
  - "Networkless verification of Clerk-issued bearer tokens via the official @clerk/backend verifier with authorized parties"
  - "Deny-by-default global guard that attaches only server-resolved local identity and capabilities"
  - "Race-safe one-user-per-subject provisioning with first-create-only verified-email admin bootstrap"
  - "Keyed HMAC tombstone denial before provisioning and explicit local capability grant/revoke operations"
affects:
  - "Plan 01-07 (extends openapi.ts / identity API), Plan 01-08 (reuses subjectDigestFor for the deletion tombstone), all later backend phases (CurrentUser + capability state)"

# Tech tracking
tech-stack:
  added:
    - "@clerk/backend 3.29.0 verifyToken() with jwtKey (networkless) and authorizedParties"
    - "Nest global guard via app.useGlobalGuards, Reflector metadata and createParamDecorator"
    - "Prisma unique-conflict (P2002) create/fallback-read for race-safe provisioning"
    - "Node crypto createHmac('sha256', TOMBSTONE_SECRET) keyed subject digest"
  patterns:
    - "Thin custom guard around the official verifier; no Nest Clerk SDK, no decode-only path, no Backend API call per request"
    - "401 for failed authentication vs 403 for an authenticated token missing its required display-name claim"
    - "Cross-module identity access through an interface + injection token, not a concrete repository"
    - "First-create-only admin policy as a pure function; later profile refresh never grants or revokes capabilities"

key-files:
  created:
    - apps/api/src/common/auth/auth.types.ts
    - apps/api/src/common/auth/clerk-token-verifier.ts (+ spec)
    - apps/api/src/common/auth/clerk-auth.guard.ts (+ spec)
    - apps/api/src/common/auth/current-user.decorator.ts
    - apps/api/src/common/auth/auth.module.ts (+ spec)
    - apps/api/src/identity/identity.types.ts
    - apps/api/src/identity/admin-bootstrap.policy.ts (+ spec)
    - apps/api/src/identity/identity.repository.ts
    - apps/api/src/identity/identity.service.ts (+ spec)
    - apps/api/src/identity/identity.module.ts
  modified:
    - apps/api/src/main.ts
    - apps/api/src/app.module.ts

key-decisions:
  - "Use the official @clerk/backend verifyToken() with a configured PEM public key and an explicit authorized-parties allowlist; no custom JWT verification and no per-request Clerk Backend API call"
  - "Bearer-only transport with a single unambiguous Authorization header; no cookie fallback and no decode before verification"
  - "Missing/invalid Clerk subject or signature -> 401; authenticated token lacking the required display-name claim -> 403 profile-incomplete; messages are fixed prose"
  - "Resolve by unique immutable Clerk subject using conflict-safe create plus fallback read; concurrency loses no user and creates no duplicate"
  - "Admin is granted only in the create branch from a normalized verified-email allowlist; explicit grant/revoke operations are the only other capability mutations"
  - "Tombstone check uses a keyed HMAC of the Clerk subject; no raw subject, email or PII is stored in the tombstone"
  - "CORS is an explicit web-origin allowlist with credentials; never a wildcard origin"
patterns-established:
  - "IdentityResolver interface + IDENTITY_RESOLVER token keeps the guard decoupled from the identity module"
  - "Tests for cryptographic verification use locally signed RS256 JWTs against the real SDK, not a mocked verifier"
  - "Real disposable PostgreSQL provisioning tests prove unique-constraint races and tombstone denial"
requirements-completed: [AUTH-02, AUTH-04, AUTH-05]

# Metrics
duration: 9min
completed: 2026-11-17
---

# Phase 1 Plan 6: Clerk Session Verification and Race-Safe Local Identity Summary

**Official networkless Clerk bearer-token verification behind a deny-by-default NestJS guard, provisioning exactly one local user with application-owned capabilities and first-create-only admin under a real PostgreSQL race.**

## Performance

- **Duration:** ~9 min
- **Started:** 2026-11-17T07:27:02Z
- **Completed:** 2026-11-17T07:36:24Z
- **Tasks:** 3 of 3 (all TDD RED -> GREEN)
- **Files:** 17 created/modified (plus this summary)

## Accomplishments

- Built `ClerkTokenVerifierService` on `@clerk/backend` `verifyToken()` using the configured networkless PEM public key and an explicit `authorizedParties` allowlist from `CLERK_WEB_ORIGIN`. All claims are parsed from `unknown`; the subject is required (401), the display name is required (403 profile-incomplete), the primary email and its verified flag are taken only from signed claims, and the result is frozen. No token, secret or profile value is logged or echoed in errors.
- Added the global `ClerkAuthGuard`: denies by default, bypasses only `@IsPublic()` routes, accepts only a single `Authorization: Bearer <token>` header, delegates verification to the official SDK, resolves the local user through `IdentityService`, attaches only that server-resolved `AuthenticatedUser`, and fails closed (401) on resolution failure. `CurrentUser` is the only handler-side identity source.
- Implemented race-safe provisioning: `users.clerk_subject` uniqueness plus conflict-safe create/fallback-read; concurrent first requests produced one user and one `CUSTOMER` baseline in a real-PostgreSQL test. Admin is granted only in the create branch when a normalized verified primary email matches normalized `ADMIN_EMAILS`; later profile refresh updates only local copies. Explicit `grantCapability`/`revokeCapability` operations exist for later administrative use, with no Phase 1 admin API.
- Checked the owner-selected keyed permanent tombstone (HMAC-SHA256 of the Clerk subject with `TOMBSTONE_SECRET`) before provisioning, denying a deleted subject with no raw subject in the tombstone table; retained the nullable profile columns for Plan 08's anonymization path.
- Wired `IdentityModule` and `AuthModule` into `AppModule` and registered the guard plus an explicit CORS origin allowlist in `main.ts`, preserving Plan 05's logger -> pipe -> filter order.

## Verification Evidence (commands actually run)

| Command | Result |
|---------|--------|
| `pnpm --filter @ecom-v1/api test -- src/common/auth/clerk-token-verifier.spec.ts` | RED: missing module; GREEN: PASS (real locally signed RS256 tokens, no mocked SDK) |
| `pnpm --filter @ecom-v1/api test -- src/identity/admin-bootstrap.policy.spec.ts src/identity/identity.service.spec.ts` | RED: missing modules; GREEN: PASS incl. 8-way concurrent first-create on a disposable real PostgreSQL cluster |
| `pnpm --filter @ecom-v1/api test -- src/common/auth/clerk-auth.guard.spec.ts src/common/auth/auth.module.spec.ts` | RED: missing modules; GREEN: PASS (Supertest status/identity/public-route/ambiguity/fail-closed cases) |
| `pnpm --filter @ecom-v1/api test` (full suite) | PASS — 12 files, 64 tests, 0 skipped |
| `pnpm --filter @ecom-v1/api typecheck` | PASS (strict TS 6) |
| `pnpm --filter @ecom-v1/api build` | PASS (`nest build`) |
| Log-safety scan | Source scan found no token/secret/profile logging in the verifier or guard; the verifier spec spies on all console methods, and the existing Plan 05 Pino log-shape spec asserts a bearer token never appears in emitted JSON |
| Shortcut scan | No `decodeJwt`/`jwt.decode`/`authenticateRequest`/`createClerkClient`/`fetch` in auth source; verification is networkless SDK-only |
| CORS scan | No wildcard origin in `auth.module.ts` or `main.ts` |

**Environment note:** no Docker daemon is available here, so the real-PostgreSQL provisioning test used the same disposable `initdb`/`pg_ctl` fallback as Plans 01-04/01-05 and applied the committed migration. Networkless verification was exercised directly against the real `@clerk/backend` verifier with locally generated RSA keys; no online or session-calling shortcut replaced it.

## Task Commits

Each task was committed atomically on the main working tree with hooks enabled (no `--no-verify`):

1. **Task 1 RED (test):** `a754d39` — failing Clerk verifier spec
2. **Task 1 GREEN (feat):** `2bdae28` — networkless Clerk token verifier + auth contracts
3. **Task 3 RED (test):** `7c41269` — failing admin policy and real-DB provisioning specs
4. **Task 3 GREEN (feat):** `ccb69fb` — race-safe provisioning, admin bootstrap, tombstone denial, IdentityModule wiring
5. **Task 2 RED (test):** `5da12c2` — failing guard and auth-module specs
6. **Task 2 GREEN (feat):** `e7f3e4c` — global guard, decorator, CORS, bootstrap wiring
7. **Task 3 test fixture fix:** `87ab987` — required env before real-DB service construction

TDD gates: a `test(01-06)` commit precedes each `feat(01-06)` commit. No refactor commit was needed.

## Files Created/Modified

- `apps/api/src/common/auth/auth.types.ts` — application capability, verified identity and authenticated user contracts; DI tokens; origin parsing.
- `apps/api/src/common/auth/clerk-token-verifier.ts` — official SDK networkless verifier and typed claim extraction.
- `apps/api/src/common/auth/clerk-auth.guard.ts` — deny-by-default bearer guard with fail-closed resolution.
- `apps/api/src/common/auth/current-user.decorator.ts` — typed, server-only identity parameter.
- `apps/api/src/common/auth/auth.module.ts` — verifier + guard providers and explicit CORS option builder.
- `apps/api/src/identity/identity.types.ts` — resolve-verified-identity contracts.
- `apps/api/src/identity/admin-bootstrap.policy.ts` — pure verified-email allowlist policy.
- `apps/api/src/identity/identity.repository.ts` — focused Prisma access, HMAC subject digest, conflict-safe create.
- `apps/api/src/identity/identity.service.ts` — provisioning, refresh, tombstone denial, explicit capability operations.
- `apps/api/src/identity/identity.module.ts` — identity providers and `IDENTITY_RESOLVER` binding.
- Co-located specs for the verifier, guard, auth module, admin policy and identity service.
- `apps/api/src/main.ts`, `apps/api/src/app.module.ts` — global guard, CORS and module registration.

## Decisions Made

- 401 vs 403 is determined at the verifier: cryptographic/subject failures are unauthenticated; a valid signature with an incomplete required profile is profile-incomplete, without disclosing any local account.
- The guard preserves the SDK's sanitized errors and converts only identity-resolution failures to a generic 401; it never invent a user from client fields.
- Admin changes are create-only or explicit; a changed email can neither promote nor demote an existing user.
- The tombstone digest function is exported from `identity.repository.ts` so Plan 08 can write the identical keyed marker.

## Deviations from Plan

### Execution sequencing (not a scope change)

- Tasks were executed in dependency order 1 -> 3 -> 2 rather than numeric order: the guard (Task 2) consumes the `IdentityResolver` built in Task 3. This kept every intermediate commit buildable with no stub resolver provider. Commit messages retain their original task numbers.

### GREEN-phase test corrections (test-only)

- **1. Guard spec expectations:** a Nest `POST` handler returns 201 (not 200), and the guard-only harness has no global exception filter, so its 401 body has no plan `code` field. Corrected the two assertions; no implementation change. Committed in `e7f3e4c`.
- **2. Real-DB test env:** `beforeAll` precedes the shared setup file's per-test env defaults, so the integration spec now sets all required variables before constructing `PrismaService`. Committed in `87ab987`.
- **3. Prisma create typing:** used `include` for the nested capability create and `as const` on capability literals to satisfy Prisma 7's generated types; behavior unchanged. Committed in `ccb69fb`.

**Total: 3 test/typing corrections, 1 sequencing note. No scope, dependency-pin, product-policy or owner-decision change.**

## Issues Encountered

- The `@clerk/backend` top-level `verifyToken()` returns the payload directly and throws on failure (the legacy-return wrapper), while the lower-level export returns a result object. The verifier uses the top-level throwing form, confirmed against the installed 3.29.0 runtime.
- Clerk session JWTs must carry the `cat` session-token header value for the SDK to accept them; the test token builder includes it so the tests exercise genuine session verification.

## Stub Tracking

None. The only `null` comparisons in source are legitimate verification/DB-not-found checks; no empty placeholder values, TODO/FIXME text or unwired data sources were introduced.

## Threat Flags

None. The implemented surfaces (bearer header, authorized parties, copied token after deletion, first-request race, first-create admin, client identity fields, token/profile logging, verified-email flag) are all in the plan's STRIDE register T-06-01..T-06-07 and are covered by code plus tests. The CORS allowlist is an explicit Task 2 requirement, not a new unlisted surface.

## Next Phase Readiness

- Plan 01-07 can add the current-profile endpoint using `@CurrentUser()` and extend the single `openapi.ts` assembler.
- Plan 01-08 can write the deletion tombstone with `subjectDigestFor()` from `identity.repository.ts`; the guard already denies tombstoned subjects before provisioning.

## Self-Check: PASSED

- Verified all 14 plan source/spec files exist plus modified `main.ts` and `app.module.ts` (17 files total) — FOUND.
- Verified all 7 task commits exist in git history: `a754d39`, `2bdae28`, `7c41269`, `ccb69fb`, `5da12c2`, `e7f3e4c`, `87ab987` — FOUND.
- Full suite (12 files / 64 tests), typecheck and build re-run and passing after the final commit.

---
*Phase: 01-platform-foundation-identity*
*Plan: 06*
*Completed: 2026-11-17*
