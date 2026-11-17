---
phase: 01
slug: platform-foundation-identity
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-11-16
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from `01-RESEARCH.md` § Validation Architecture and the nine Phase 1 PLAN.md files.
> The test harness does not exist yet — it is created by Wave 2 (Plan 01-02 Task 3) and Wave 3 (Plan 01-04 Task 1).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.1.0 (install gated on the owner's SUS-package verdict in Plan 01-01) + Supertest 7.3.2 for HTTP API tests |
| **Config file** | `apps/api/vitest.config.ts` (created by Plan 01-02 Task 3); Prisma CLI config `apps/api/prisma.config.ts` (Plan 01-04 Task 2) |
| **Quick run command** | `pnpm --filter @ecom-v1/api test -- <path>` (targeted spec/e2e file) |
| **Full suite command** | `pnpm run verify:phase-01` (Plan 01-09 Task 1; equals the GitHub Actions gate) |
| **Estimated runtime** | ~30 seconds targeted · ~180 seconds full suite (includes disposable PostgreSQL provisioning and migration) |

**Single test layout (set by Plan 01-02 Task 3, binding on every later plan):**

- `apps/api/src/<domain>/<name>.spec.ts` — unit tests, co-located with the source
- `apps/api/src/<domain>/<name>.e2e-spec.ts` — API/contract suites (Supertest)
- `apps/api/src/test/setup.ts` — shared deterministic setup
- `apps/api/src/test/fixtures/` — shared fixtures (owner-scoped resource fixture)
- `apps/api/src/test/phase-01-acceptance.e2e-spec.ts` — phase acceptance matrix

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @ecom-v1/api test -- <targeted path from the task>`
- **After every plan wave:** Run `pnpm --filter @ecom-v1/api test` (full API suite) and `pnpm --filter @ecom-v1/api db:test` once the database layer exists
- **Before `/gsd-verify-work`:** `pnpm run verify:phase-01` must be green
- **Max feedback latency:** 60 seconds targeted, 180 seconds full suite

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 01-01-01 | 01 | 1 | OPS-05 | T-01-01, T-01-04 | Complete direct-dependency inventory with exact pins, official sources, and the pnpm/Corepack pin | configuration | `test -s DEPENDENCIES.md && grep -q 'pnpm@11.5.2' DEPENDENCIES.md && grep -qi 'corepack' DEPENDENCIES.md` | ❌ W0 | ⬜ pending |
| 01-01-02 | 01 | 1 | OPS-05 | T-01-02, T-01-SC | Owner verdict gates the SUS `vitest` install; no auto-approval | manual decision | `npm view vitest@5.1.0 name version repository.url dist.tarball --json` | ❌ W0 | ⬜ pending |
| 01-01-03 | 01 | 1 | OPS-05 | T-01-02 | Attributable owner verdict recorded without changing its meaning | configuration | `grep -Eq 'Approved by owner|Rejected by owner' DEPENDENCIES.md` | ❌ W0 | ⬜ pending |
| 01-02-01 | 02 | 2 | OPS-05 | T-02-05 | Exact Node/pnpm/Vite+ toolchain; `packageManager` = `pnpm@11.5.2` | configuration | `grep -Eq '"packageManager"[[:space:]]*:[[:space:]]*"pnpm@11\.5\.2"' package.json && test "$(pnpm --version)" = '11.5.2'` | ❌ W0 | ⬜ pending |
| 01-02-02 | 02 | 2 | OPS-05 | T-02-01, T-02-02 | Every direct dependency pinned exactly and inventoried; no undeclared package | build + configuration | `pnpm install --frozen-lockfile && pnpm --filter @ecom-v1/api build && pnpm --filter @ecom-v1/api typecheck` | ❌ W0 | ⬜ pending |
| 01-02-03 | 02 | 2 | OPS-05 | T-02-04 | Executable Vitest/Supertest harness at the single test layout, no demo seed | unit | `pnpm --filter @ecom-v1/api test && pnpm test` | ❌ W0 | ⬜ pending |
| 01-03-01 | 03 | 1 | AUTH-06 | T-03-02 | Owner-selected merchant-obligation deletion policy (no invented legal rule) | manual decision | `test -f .planning/phases/01-platform-foundation-identity/01-CONTEXT.md && grep -q 'D-08' .planning/phases/01-platform-foundation-identity/01-CONTEXT.md` | ❌ W0 | ⬜ pending |
| 01-03-02 | 03 | 1 | AUTH-06 | T-03-01, T-03-03 | Owner-selected tombstone/retention and provider-revocation boundary | manual decision | `test -f .planning/phases/01-platform-foundation-identity/01-CONTEXT.md && grep -q 'D-07' .planning/phases/01-platform-foundation-identity/01-CONTEXT.md` | ❌ W0 | ⬜ pending |
| 01-03-03 | 03 | 1 | AUTH-06 | T-03-04 | Owner resolutions recorded in PROJECT.md and CONTEXT.md | configuration | `grep -Eq 'Owner Resolution' .planning/PROJECT.md && grep -Eq 'Owner Resolution' .planning/phases/01-platform-foundation-identity/01-CONTEXT.md` | ❌ W0 | ⬜ pending |
| 01-04-01 | 04 | 3 | AUTH-06, OPS-05 | T-04-01, T-04-04 | Unique/restrict constraints, apply→reset→re-apply proof, gallery seed capacity | integration (real PostgreSQL) | `bash apps/api/scripts/test-migrations.sh && pnpm --filter @ecom-v1/api test -- src/common/database/schema.spec.ts` | ❌ W0 | ⬜ pending |
| 01-04-02 | 04 | 3 | OPS-05 | T-04-03, T-04-05 | Typed env validation, separate direct/runtime URLs, bounded pg pool | unit + integration | `pnpm --filter @ecom-v1/api exec prisma generate && pnpm --filter @ecom-v1/api test -- src/common/database/prisma.service.spec.ts` | ❌ W0 | ⬜ pending |
| 01-05-01 | 05 | 4 | OPS-01, OPS-03 | T-05-01, T-05-02, T-05-03 | Global validation, sanitized errors, redacted Pino logs, one OpenAPI assembler | unit + API | `pnpm --filter @ecom-v1/api test -- src/common/validation/validation.pipe.spec.ts src/common/errors/api-exception.filter.spec.ts` | ❌ W0 | ⬜ pending |
| 01-05-02 | 05 | 4 | OPS-03 | T-05-04, T-05-06 | Truthful liveness/readiness; non-2xx when PostgreSQL is unavailable | API + integration | `pnpm --filter @ecom-v1/api test -- src/health/health.spec.ts` | ❌ W0 | ⬜ pending |
| 01-05-03 | 05 | 4 | OPS-05 | T-05-07, T-05-08 | Compose starts API+PostgreSQL, applies migrations via `db:deploy`, no readiness race | environment | `docker compose config --quiet && docker compose build api && docker compose up -d --wait --wait-timeout 180` | ❌ W0 | ⬜ pending |
| 01-06-01 | 06 | 5 | AUTH-02 | T-06-01, T-06-06, T-06-07 | Official Clerk verification, fail-closed claims, no token logging | unit | `pnpm --filter @ecom-v1/api test -- src/common/auth/clerk-token-verifier.spec.ts` | ❌ W0 | ⬜ pending |
| 01-06-02 | 06 | 5 | AUTH-02, AUTH-04 | T-06-01, T-06-03 | Deny-by-default global guard; public routes explicit | API | `pnpm --filter @ecom-v1/api test -- src/common/auth/clerk-auth.guard.spec.ts src/common/auth/auth.module.spec.ts` | ❌ W0 | ⬜ pending |
| 01-06-03 | 06 | 5 | AUTH-04, AUTH-05 | T-06-03, T-06-04, T-06-02 | Race-safe single provisioning, first-create-only admin, tombstone denial, nullable profile | integration (real PostgreSQL) | `pnpm --filter @ecom-v1/api test -- src/identity/admin-bootstrap.policy.spec.ts src/identity/identity.service.spec.ts` | ❌ W0 | ⬜ pending |
| 01-07-01 | 07 | 6 | OPS-01 | T-07-01 | Capability decisions from local state only; client role fields rejected | unit | `pnpm --filter @ecom-v1/api test -- src/common/authorization/capability.guard.spec.ts` | ❌ W0 | ⬜ pending |
| 01-07-02 | 07 | 6 | AUTH-01, AUTH-02 | T-07-04, T-07-05 | Minimal `GET /users/me`; single OpenAPI assembler; nullable profile fields | API + contract | `pnpm --filter @ecom-v1/api test -- src/identity/identity.e2e-spec.ts && pnpm --filter @ecom-v1/api openapi:emit` | ❌ W0 | ⬜ pending |
| 01-07-03 | 07 | 6 | AUTH-01, AUTH-03, OPS-01 | T-07-02, T-07-03, T-07-06 | Unauthenticated 401, wrong-role 403, cross-owner non-disclosing 404, documented Clerk contract | API + manual configuration | `pnpm --filter @ecom-v1/api test -- src/identity/identity.e2e-spec.ts && grep -q 'Sign-up requirements' docs/identity/clerk-integration.md` | ❌ W0 | ⬜ pending |
| 01-08-01 | 08 | 7 | AUTH-06 | T-08-01, T-08-03, T-08-04, T-08-07 | Transactional anonymization, retained references, tombstone, admin removal | integration (real PostgreSQL) | `pnpm --filter @ecom-v1/api test -- src/identity/account-lifecycle.service.spec.ts` | ❌ W0 | ⬜ pending |
| 01-08-02 | 08 | 7 | AUTH-06, OPS-01 | T-08-02, T-08-06 | Self-only deletion; provider failure leaves local denial intact | unit + API | `pnpm --filter @ecom-v1/api test -- src/identity/clerk-account-revocation.service.spec.ts src/identity/account-lifecycle.service.spec.ts` | ❌ W0 | ⬜ pending |
| 01-08-03 | 08 | 7 | AUTH-06, OPS-01 | T-08-01, T-08-05 | Retained-order integrity, owner-approved closure states, tombstone denial | API + integration | `pnpm --filter @ecom-v1/api test -- src/identity/account-lifecycle.e2e-spec.ts` | ❌ W0 | ⬜ pending |
| 01-09-01 | 09 | 8 | OPS-05 | T-09-01, T-09-02, T-09-04 | CI == local gate; pinned pnpm via Corepack; shared DB entrypoint | CI | `bash -n scripts/verify-phase-01.sh && grep -q 'frozen-lockfile' .github/workflows/ci.yml && pnpm run verify:phase-01` | ❌ W0 | ⬜ pending |
| 01-09-02 | 09 | 8 | OPS-01, AUTH-04, AUTH-05, AUTH-06 | T-09-05 | Phase acceptance matrix + journey contracts incl. gallery seed capacity scope | API + integration | `pnpm --filter @ecom-v1/api test -- src/test/phase-01-acceptance.e2e-spec.ts` | ❌ W0 | ⬜ pending |
| 01-09-03 | 09 | 8 | OPS-03, OPS-05 | T-09-05, T-09-06 | Clean-snapshot Compose proof and honest verification record | environment + manual review | `test -s docs/verification/phase-01-verification.md && grep -Eq 'PASS|FAIL' docs/verification/phase-01-verification.md` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/api/src/test/setup.ts` + `apps/api/src/test/app.e2e-spec.ts` — Vitest/Supertest harness (Plan 01-02 Task 3)
- [ ] `apps/api/scripts/test-migrations.sh` — disposable PostgreSQL provisioning, migration apply/reset/re-apply, constraint checks (Plan 01-04 Task 1)
- [ ] `apps/api/src/common/database/schema.spec.ts` — real-database constraint suite (Plan 01-04 Task 1)
- [ ] `apps/api/src/test/fixtures/private-resource.fixture.ts` — owner-scoped test resource (Plan 01-07 Task 3)
- [ ] Clerk test-token/claim strategy without committed secrets — deterministic signed-claim fixtures plus the documented live-instance procedure (Plans 01-06 / 01-07)
- [ ] `scripts/verify-phase-01.sh` + `.github/workflows/ci.yml` — CI/local gate (Plan 01-09 Task 1)
- [ ] `vitest@5.1.0` install approval — blocking owner decision in Plan 01-01 Task 2 (prerequisite for every suite above)

*No framework needs installing beyond the reviewed dependency set; the Vitest install itself is gated by the Plan 01-01 owner decision.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live Clerk instance matches the documented configuration (required email + one custom display-name field, email verification enabled, three signed session claims present, authorized party matching the API allowlist) | AUTH-01, AUTH-02, AUTH-05 | Requires the owner's Clerk dashboard and a live session token; no repository CLI can assert dashboard configuration | Open the Clerk instance per `docs/identity/clerk-integration.md` → `Live Clerk verification procedure`; decode one test session token and confirm the primary email, display name, and primary-email-verified claims are present |
| Browser sign-up, sign-in, session persistence across browser sessions, and sign-out | AUTH-01, AUTH-02, AUTH-03 | Phase 1 ships no browser UI; the Clerk UI is wired in Phase 5. Phase 1 proves the API/token contract and the documented configuration only — it does **not** claim browser verification | Deferred to Phase 5; tracked in `docs/architecture/phase-01-journeys.md` → `Phase 5 handoff` |
| Merchant-obligation deletion policy, tombstone/retention rule, and Clerk revocation sequence | AUTH-06 | Consequential privacy/retention/product decision reserved to the owner by `GSD_WORKFLOW.md` | Plan 01-03 blocking decision checkpoints; recorded in `.planning/PROJECT.md` |

*All other phase behaviours have automated verification through the commands listed above.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s targeted
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending — set to `nyquist_compliant: true` only after Wave 0 exists and the Phase 1 suites have been executed.
