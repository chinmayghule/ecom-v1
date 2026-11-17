---
phase: 01-platform-foundation-identity
verified: 2026-11-17T14:10:00Z
status: human_needed
score: 14/14 must-haves verified
overrides_applied: 0
re_verification: false
human_verification:
  - test: "Live Clerk dashboard configuration matches the documented contract"
    expected: "Clerk instance requires email + a required display-name field at signup; email verification enabled; the three signed session claims (primaryEmail, displayName, emailVerified) are emitted; authorized parties match CLERK_WEB_ORIGIN"
    why_human: "Requires the owner's Clerk dashboard and a live session token. No repository CLI can assert dashboard state. Documented as manual-only in 01-VALIDATION.md; the API-side claim contract is verified programmatically but the live instance is not."
  - test: "Browser sign-up, sign-in, session persistence across browser sessions, and sign-out"
    expected: "A visitor can register/sign in through the Clerk UI, remain signed in across browser sessions, and sign out"
    why_human: "Phase 1 ships no browser UI (the Clerk UI is wired in Phase 5). Phase 1 proves only the API token/claims contract. Explicitly a Phase 5 deliverable recorded as manual-only in 01-VALIDATION.md and docs/architecture/phase-01-journeys.md."
  - test: "Docker Compose runtime smoke (docker compose build api && docker compose up -d --wait)"
    expected: "The pinned API image builds and the API+PostgreSQL stack reaches health-gated readiness with one command"
    why_human: "No Docker daemon is reachable in this environment (docker info fails). docker compose config --quiet was validated (exit 0) and every real-PostgreSQL check used the supported local initdb/pg_ctl fallback, but the container runtime path was not executed. Recorded as 'unverified here, not failed' in docs/verification/phase-01-verification.md."
---

# Phase 1: Platform Foundation & Identity — Verification Report

**Phase Goal:** A runnable, CI-tested monorepo where a verified Clerk session becomes a local application user with the right role, and every endpoint already enforces validation, authorization and ownership server-side.
**Verified:** 2026-11-17T14:10:00Z
**Status:** human_needed
**Re-verification:** No — initial verification (no prior VERIFICATION.md found)
**Automated evidence:** All 14 consolidated must-have truths VERIFIED; `pnpm --filter @ecom-v1/api test` = 18 files / 110 tests passed; `pnpm run verify:phase-01` gate exited 0. The human verification section is non-empty, so per the workflow decision tree status is `human_needed` (not `passed`), even though every automated must-have passed.

## Goal Achievement

Verification followed goal-backward methodology against the ACTUAL codebase: existence → substantive → wired → data-flow. SUMMARY.md claims were treated as unverified narratives and each was re-checked in source. No must-have was downgraded to a gap on the basis of a SUMMARY claim alone.

### Observable Truths

Truths are the 5 ROADMAP success criteria (the non-negotiable contract) plus the distinct plan-frontmatter truths, deduplicated. Per the roadmap's mapping convention, backend Clerk-facing criteria are proven through the API/integration harness + documented configuration contract; browser journeys are Phase 5.

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Fresh clone runs local env with one Compose command; health responds; every request emits Pino logs; push triggers green CI (SC1) | ✓ VERIFIED | `compose.yaml` (55 lines, postgres:17-alpine + healthchecks); `apps/api/Dockerfile` runs `db:deploy` before serving; `main.ts` registers global Pino + pipe + filter; `.github/workflows/ci.yml` runs `pnpm run verify:phase-01` on push/PR; verified gate exit 0. Compose *runtime* (build/up) not executed — see human verification (environment limitation, documented). |
| 2 | Clerk register with email + required display name; first verified sign-in provisions local user with no webhook (SC2) | ✓ VERIFIED | `clerk-token-verifier.ts` extracts `sub`/`primaryEmail`/`displayName`/`emailVerified`, 403 on missing display name; `identity.service.ts` conflict-safe (P2002) create-once provisioning; no webhook route exists; `docs/identity/clerk-integration.md` § Sign-up requirements + No webhook provisioning. Browser portion is Phase 5 (human item). |
| 3 | Session persistence across browser sessions + sign-out; allowlisted verified email grants admin on first sign-in (SC3) | ✓ VERIFIED | API harness proves bearer-token contract; `admin-bootstrap.policy.ts` gates `isAdminOnFirstCreate` on `emailVerified===true` and create-branch only; acceptance tests `grants admin only on first create...` and `refreshes email and profile on return without mutating roles` (both pass). Clerk session persistence/sign-out contract documented; browser journeys are Phase 5 (human item). |
| 4 | User can delete account; personal data anonymized; order records retained with anonymized buyer reference (SC4) | ✓ VERIFIED | `account-lifecycle.service.ts` + `repository.ts` use `$transaction` for in-place anonymization + capability removal + keyed HMAC tombstone; `schema.prisma` `ON DELETE RESTRICT` on `buyer_user_id`/`owner_user_id`; `identity_tombstones.subject_digest` unique; acceptance case `anonymizes personal fields in place while retaining the stable order reference` passes. |
| 5 | Every endpoint rejects unauthenticated/invalid requests and denies other users' resources — server-side, cross-user/role-matrix tested (SC5) | ✓ VERIFIED | `clerk-auth.guard.ts` deny-by-default (only `@IsPublic()` bypasses); `capability.guard.ts` reads local state + Reflector metadata; `validation.pipe.ts` whitelist + forbidUnknown; acceptance cases for 401/403/cross-owner non-disclosing 404 + role matrix all pass; test log shows 400/401/403/404/200/201/204/409 outcomes. |
| 6 | No dependency installed before SUS Vitest owner verdict; exact versions inventoried; pnpm pinned to 11.5.2 via Corepack (P01) | ✓ VERIFIED | `DEPENDENCIES.md` (142 lines) records `vitest` SUS + "Approved by owner...2026-11-17", `pnpm@11.5.2`, Corepack 0.36.0; runtime `pnpm --version` = 11.5.2; `package.json` `packageManager: "pnpm@11.5.2"`. |
| 7 | One pinned pnpm workspace + NestJS API + unified Vite+ toolchain; builds under strict TS; harness constructs/closes Nest app; reproducible lockfile (P02) | ✓ VERIFIED | `pnpm-workspace.yaml`, `pnpm-lock.yaml` (5369 lines), `tsconfig.base.json` strict, `apps/api/src/test/app.e2e-spec.ts` (43 lines) real Nest app; gate ran `pnpm install --frozen-lockfile`, build + typecheck clean. |
| 8 | Owner-selected account-deletion behavior recorded in project records before schema/deletion code (P03) | ✓ VERIFIED | `PROJECT.md` Key Decisions has "Owner resolution (staged-closure)" and "keyed-permanent-tombstone-local-first" (2026-11-17); `01-CONTEXT.md` Owner Resolution subsection D-07..D-09; verification-map checks pass. |
| 9 | Versioned Prisma migration creates identity/lifecycle foundation on empty PostgreSQL; DB constraints enforce uniqueness/tombstone/retention; direct migration URL + separate runtime connection (P04) | ✓ VERIFIED | `schema.prisma` (188 lines) + `migration.sql` (171 lines, 7 CREATE TABLE); gate applied migration on empty disposable DB (8 tables), dropped + re-applied cleanly; `schema.spec.ts` 6 constraint tests passed; `DIRECT_URL`/`DATABASE_URL` split in `prisma7.config.ts` + `prisma.service.ts`. |
| 10 | Every request validated with one sanitized error shape; Pino logs without tokens/cookies/secrets; one OpenAPI assembler (P05) | ✓ VERIFIED | `main.ts` registers one global pipe + one global filter; `api-exception.filter.ts` sanitized envelope; `pino.config.ts` whitelist serializer + explicit redact paths (`authorization`, `cookie`, `req.body`); `openapi.ts` sole assembler — `openapi:emit` passed and emitted `/users/me`, health routes, bearer security. |
| 11 | Only valid Clerk-signed bearer from authorized party authenticates; race-safe single local user; admin only on first create; authz from local DB state (P06) | ✓ VERIFIED | `clerk-auth.guard.ts` injects verifier + resolver, calls `resolveVerifiedIdentity`; `clerk-token-verifier.ts` uses official `verifyToken()` with jwtKey + authorizedParties (networkless, real RS256 tests); `identity.service.ts` P2002 conflict-safe create + first-create admin; tombstone pre-provision denial. |
| 12 | Signed-in user reads only own profile; non-admin denied; cannot read another's record; Clerk config contract; OpenAPI baseline without Phase 4 freeze (P07) | ✓ VERIFIED | `identity.controller.ts` GET `/users/me` server-derived projection; `private-resource.fixture.ts` DB predicate `where: { id, buyerUserId: currentUser.id }` (non-disclosing 404); `docs/identity/clerk-integration.md` (134 lines); OpenAPI baseline 0.1.0 (unfrozen). |
| 13 | Eligible user anonymized without deleting stable identity/retained records; obligations → staged closure; deleted subject denied even on provider failure; self-only deletion (P08) | ✓ VERIFIED | `account-lifecycle.service.ts` + `repository.ts` `$transaction`, staged CLOSURE_ACCEPTED with retained MERCHANT completion, fail-closed tombstone; `clerk-account-revocation.service.ts` local-first revoke/deleteUser; `DELETE /users/me` derives target from `@CurrentUser`, rejects client fields (400); 204/202/409 outcomes in test log. |
| 14 | Every push/PR runs same CI gate; clean snapshot starts stack without local-only files/sleeps; journeys mapped; verification records real commands + manual separation (P09) | ✓ VERIFIED | `ci.yml` invokes `pnpm run verify:phase-01` with `--frozen-lockfile`; `scripts/verify-phase-01.sh` (107 lines) initdb/pg_ctl fallback + bounded polling (no sleep); `phase-01-journeys.md` (145 lines) names Phase 2/3/4/5 owners; `docs/verification/phase-01-verification.md` (84 lines) separates automated PASSes from manual-only/Phase 5 checks. |

**Score:** 14/14 truths verified. No truth FAILED. The three manual/environment items are listed under Human Verification Required and do not falsify any must-have: the automated portion of each is complete and the deferred portion is explicitly owned by a later phase or an external dashboard.

### Required Artifacts

All must-have artifacts pass L1 (exist), L2 (substantive), and L3 (wired). No stub, orphan, or empty implementation found. Representative sample:

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `DEPENDENCIES.md` | ≥25 lines, pins + SUS verdict | ✓ VERIFIED | 142 lines; vitest SUS verdict + pnpm/Corepack pins |
| `package.json` / `pnpm-lock.yaml` | workspace + reproducible lockfile | ✓ VERIFIED | `packageManager` pin; 5369-line lockfile; frozen install passed |
| `apps/api/src/main.ts` | bootstrap + single pipe/filter/guards | ✓ VERIFIED | 48 lines; `useGlobalPipes`, `useGlobalFilters`, `useGlobalGuards`, single OpenAPI |
| `apps/api/prisma/schema.prisma` + `migration.sql` | versioned foundation | ✓ VERIFIED | 188 / 171 lines; 8 tables, 7 CREATE TABLE, ON DELETE RESTRICT |
| `apps/api/src/common/database/prisma.service.ts` | single client + pg pool | ✓ VERIFIED | 57 lines; pooled DATABASE_URL vs direct DIRECT_URL |
| `apps/api/src/common/auth/clerk-token-verifier.ts` | official verifier | ✓ VERIFIED | 87 lines; `verifyToken()` jwtKey + authorizedParties |
| `apps/api/src/common/auth/clerk-auth.guard.ts` | deny-by-default guard | ✓ VERIFIED | 78 lines; injects verifier + resolver |
| `apps/api/src/identity/identity.service.ts` | race-safe provisioning | ✓ VERIFIED | 143 lines; P2002 create/fallback, first-create admin |
| `apps/api/src/common/authorization/capability.guard.ts` | local-state capability gate | ✓ VERIFIED | 67 lines; Reflector + AuthenticatedUser |
| `apps/api/src/identity/identity.controller.ts` | `/users/me` + `DELETE /users/me` | ✓ VERIFIED | 86 lines; server-derived projection + self-only deletion |
| `apps/api/src/identity/account-lifecycle.service.ts` | transactional lifecycle | ✓ VERIFIED | 84 lines; `$transaction`, staged closure, fail-closed |
| `apps/api/src/test/phase-01-acceptance.e2e-spec.ts` | acceptance matrix | ✓ VERIFIED | 514 lines; 11 acceptance cases + journey-doc TDD check |
| `.github/workflows/ci.yml` / `scripts/verify-phase-01.sh` | unified gate | ✓ VERIFIED | 75 / 107 lines; CI invokes same script |
| `docs/identity/clerk-integration.md`, `docs/identity/account-deletion.md`, `docs/architecture/phase-01-journeys.md`, `docs/verification/phase-01-verification.md` | contracts/evidence | ✓ VERIFIED | 134 / 160 / 145 / 84 lines |

### Key Link Verification

Every key_link declared in the 9 PLAN frontmatters was checked with targeted source greps:

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `DEPENDENCIES.md` | 01-RESEARCH audit | vitest SUS / pnpm@11.5.2 carried forward | ✓ WIRED | Both tokens present verbatim |
| `package.json` | lockfile / 01-01 | `packageManager` pin = 11.5.2 | ✓ WIRED | Runtime pnpm --version = 11.5.2 |
| `apps/api/vitest.config.ts` | `app.e2e-spec.ts` | `setupFiles` + `include` | ✓ WIRED | Both configured |
| `schema.prisma` | `migration.sql` | CREATE TABLE equivalence | ✓ WIRED | Gate applied on empty DB |
| `prisma.service.ts` | `prisma7.config.ts` | separate DIRECT_URL / DATABASE_URL | ✓ WIRED | Both present |
| `schema.prisma` | `schema.spec.ts` | real-PG ON DELETE RESTRICT proof | ✓ WIRED | 6 constraint tests pass |
| `main.ts` | `validation.pipe.ts` | `useGlobalPipes` | ✓ WIRED | Line 27 |
| `health.service.ts` | `prisma.service.ts` | `$queryRaw SELECT true` | ✓ WIRED | Line 50 (real dependency query) |
| `main.ts` | `openapi.ts` | single assembler import | ✓ WIRED | `openapi:emit` emitted baseline |
| `compose.yaml` | `Dockerfile` | postgres:17-alpine + healthcheck + `db:deploy` | ✓ WIRED | Config validated |
| `clerk-auth.guard.ts` | `clerk-token-verifier.ts` | `verifyToken` / injected verifier | ✓ WIRED | Lines 13, 52 |
| `clerk-auth.guard.ts` | `identity.service.ts` | `resolveVerifiedIdentity` | ✓ WIRED | Line 71 |
| `identity.service.ts` | `schema.prisma` | unique clerk_subject / capabilities | ✓ WIRED | P2002 create path + unique constraint |
| `capability.guard.ts` | `current-user.decorator.ts` | `AuthenticatedUser` local state | ✓ WIRED | Guard reads request.user |
| `private-resource.fixture.ts` | `schema.prisma` | `where: { id, buyerUserId: currentUser.id }` | ✓ WIRED | Line 49 |
| `docs/identity/clerk-integration.md` | `clerk-token-verifier.ts` | claim names align | ✓ WIRED | Doc `primaryEmail`/`displayName`/`emailVerified` = verifier constants |
| `account-lifecycle.service.ts` | `account-lifecycle.repository.ts` | `$transaction` atomicity | ✓ WIRED | Lines 50, 81 in repository |
| `account-lifecycle.service.ts` | `clerk-account-revocation.service.ts` | local-first `revoke`/`deleteUser` | ✓ WIRED | Service line 69 |
| `schema.prisma` | `account-lifecycle.e2e-spec.ts` | buyer_user_id / identity_tombstones | ✓ WIRED | Lines 126, 146, 154 |
| `ci.yml` | `verify-phase-01.sh` | `pnpm run verify:phase-01` | ✓ WIRED | Lines 69-70 |
| `phase-01-journeys.md` | `ROADMAP.md` | Phase 1/2/3/4/5 ownership named | ✓ WIRED | Present |

### Data-Flow Trace (Level 4)

Artifacts that render/provision dynamic data were traced upstream to confirm real data flow, not hardcoded values:

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| `GET /users/me` | `UserProfile` projection | `identity.service.currentProfile` from DB-resolved `AuthenticatedUser` | Yes — Prisma `findByClerkSubject` / race-safe create | ✓ FLOWING |
| `clerk-auth.guard` | `request.user` | `resolver.resolveVerifiedIdentity` → official Clerk `verifyToken` claims → local user | Yes — real RS256 verification + DB | ✓ FLOWING |
| admin grant | `capabilities[]` | `isAdminOnFirstCreate(email, emailVerified, ADMIN_EMAILS)` in create branch | Yes — verified-email allowlist | ✓ FLOWING |
| `DELETE /users/me` | lifecycle outcome | obligation assessment → transactional anonymization + tombstone | Yes — real DB rows, retained order refs | ✓ FLOWING |
| readiness probe | health state | `prisma.$queryRaw SELECT true` | Yes — genuine dependency query, fails closed | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Full API suite | `pnpm --filter @ecom-v1/api test` | 18 files / 110 tests passed, exit 0 | ✓ PASS |
| Full phase gate (lint/typecheck/generate/build/db:deploy/db:test/suite/compose config) | `pnpm run verify:phase-01` | exit 0; migration apply→reset→re-apply (8 tables) + 6 constraint tests + 110 tests | ✓ PASS |
| OpenAPI baseline emission | `pnpm --filter @ecom-v1/api openapi:emit` | exit 0; `/users/me`, health routes, bearer security present | ✓ PASS |
| Toolchain pins | `node --version`, `pnpm --version` | v24.22.2 / 11.5.2 | ✓ PASS |
| Migration on empty DB | (within gate) `db:test` | 8 tables, reverted + re-applied cleanly | ✓ PASS |

### Probe Execution

No `probe-*.sh` scripts are declared in any PLAN or present in the repository. Probe-based verification does not apply to this phase. **SKIPPED (no probes declared).**

### Requirements Coverage

All 9 Phase 1 requirement IDs are accounted for across the 9 PLAN frontmatters; none orphaned or missing. REQUIREMENTS.md marks each Complete and the traceability table maps each to Phase 1.

| Requirement | Source Plan(s) | Description | Status | Evidence |
| ----------- | -------------- | ----------- | ------ | -------- |
| AUTH-01 | 01-07 | Clerk register with email + required display name | ✓ SATISFIED | Verifier 403 on missing displayName; Clerk config contract doc |
| AUTH-02 | 01-06, 01-07 | Sign in / remain signed in across sessions | ✓ SATISFIED (backend) | Official verifier + bearer contract; browser persistence is Phase 5 (human) |
| AUTH-03 | 01-07 | Sign out | ✓ SATISFIED (backend contract) | Bearer token contract documented; browser sign-out is Phase 5 (human) |
| AUTH-04 | 01-06 | First verified sign-in provisions local user, no webhooks | ✓ SATISFIED | Conflict-safe create-once; no webhook route |
| AUTH-05 | 01-06 | Allowlisted verified email grants admin on first sign-in | ✓ SATISFIED | `isAdminOnFirstCreate` gated on emailVerified; acceptance tests |
| AUTH-06 | 01-03, 01-04, 01-08 | Delete account; anonymize profile, retain orders | ✓ SATISFIED | Transactional anonymization + keyed tombstone + ON DELETE RESTRICT; owner resolutions recorded |
| OPS-01 | 01-07, 01-08, 01-09 | Server-side validation, authorization, ownership on every endpoint | ✓ SATISFIED | Global pipe/guard/filter + role/ownership acceptance cases |
| OPS-03 | 01-05, 01-09 | Pino structured logging + honest health endpoints | ✓ SATISFIED | Redacted Pino logs; real `$queryRaw` readiness, non-2xx on failure |
| OPS-05 | 01-01, 01-02, 01-04, 01-05, 01-09 | Docker Compose local dev + GitHub Actions CI | ✓ SATISFIED | `compose.yaml`, `ci.yml`, unified gate; Compose runtime not run (no daemon — human item) |

Coverage: 9/9 requirement IDs mapped to delivering plans; 0 orphaned.

### Anti-Patterns Found

Scanned all implementation files in `apps/api/src`, `scripts`, `.github`, and docs for TBD/FIXME/XXX, TODO/HACK/PLACEHOLDER, empty implementations, `.only`/`.skip`, and hardcoded-empty props.

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| `scripts/verify-phase-01.sh` | 41 | `mktemp -d ".../ecom-v1-verify-XXXXXX"` | ℹ️ INFO | `XXXXXX` is a `mktemp` template token, not a debt marker — false positive |
| `apps/api/src/test/*`, `scripts/*` | various | non-secret `*_placeholder` values | ℹ️ INFO | Deterministic test/CI environment constants, documented as such; not stubs |
| `apps/api/src/common/errors/api-exception.filter.ts` | 66 | `if (!Array.isArray(raw)) return []` | ℹ️ INFO | Defensive normalization of a non-array validation payload, not an empty stub |

No TBD/FIXME/XXX debt markers, no `.only`/`.skip` tests, no empty implementations, no orphaned data sources. **No blocker.** The advisory `01-REVIEW.md` findings (WR-01 lifecycle state never entered, WR-02 non-durable provider-retry, WR-03 duplicate audit events, IN-01 409 body shape) are contract/quality concerns explicitly marked non-blocking by the review and by the phase scope notes; none is an authentication bypass, injection, PII/tombstone leak, or data-loss defect, and none negates a must-have. They are noted here for follow-up, not counted as gaps.

### Human Verification Required

All automated must-haves pass, but the following items require a human or an unavailable external environment. Per the workflow decision tree these make the section non-empty → status `human_needed`.

#### 1. Live Clerk dashboard configuration check
**Test:** Inspect the live Clerk instance per `docs/identity/clerk-integration.md` → Live Clerk verification procedure; decode one test session token.
**Expected:** Required email + display-name field at signup; email verification enabled; `primaryEmail`/`displayName`/`emailVerified` claims present; authorized parties match the API allowlist.
**Why human:** Requires the owner's Clerk dashboard and a live token; no repository CLI can assert dashboard state. Listed manual-only in `01-VALIDATION.md` (AUTH-01, AUTH-02, AUTH-05).

#### 2. Browser sign-up / sign-in / session persistence / sign-out journeys
**Test:** Exercise the Clerk UI sign-up, sign-in, cross-session persistence and sign-out in a browser.
**Expected:** A visitor registers with email + display name, stays signed in across browser sessions, and can sign out.
**Why human:** Phase 1 ships no browser UI; the Clerk UI is wired in Phase 5. Phase 1 proves only the API token/claims contract. Explicitly a Phase 5 deliverable recorded as manual-only in `01-VALIDATION.md` and `docs/architecture/phase-01-journeys.md` (AUTH-01, AUTH-02, AUTH-03).

#### 3. Docker Compose runtime smoke
**Test:** `docker compose build api && docker compose up -d --wait --wait-timeout 180`.
**Expected:** Pinned API image builds; API + PostgreSQL reach health-gated readiness with one command.
**Why human:** No Docker daemon is reachable here (`docker info` fails). `docker compose config --quiet` was validated (exit 0) and all real-PostgreSQL checks used the supported `initdb`/`pg_ctl` fallback, but the container runtime path was not executed. Recorded as "unverified here, not failed" in `docs/verification/phase-01-verification.md` (OPS-05).

### Limitations (not gaps)

- **Docker daemon unavailable:** Compose config validated; Compose runtime not run (human item #3). Does not negate OPS-05, whose CI half is fully green and whose Compose artifacts are present and wired.
- **Pre-existing format debt:** `vp check` lint step is the enforced gate; `check.fmt=false` with singleQuote config, format debt recorded in `deferred-items.md`, not reformatted. Owner-owned uncommitted planning-file changes were left untouched.
- **Advisory review warnings:** non-blocking per `01-REVIEW.md`; tracked for follow-up, not phase blockers.

### Gaps Summary

No genuine gaps found. All 14 must-have truths, all required artifacts (existence/substance/wiring), every declared key link, all four requirement-ID coverage checks, and all Level-4 data-flow traces pass. The full test suite (110/110 across 18 files) and the `pnpm run verify:phase-01` gate (exit 0) pass independently of SUMMARY claims. Status is `human_needed` solely because the three documented manual/environment items above remain — two are explicitly Phase 5 / live-dashboard items and one is an environment (Docker daemon) limitation. Phases 2+ can proceed; those items belong to their owning phases/environments.

---

_Verified: 2026-11-17T14:10:00Z_
_Verifier: the agent (gsd-verifier)_
