<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Clerk remains the credential and authentication provider. Do not store passwords or build custom password authentication, JWT issuance, or refresh-token systems.
- **D-02:** Store Clerk's immutable user ID as the unique external identity key for the local user. Email is not the account identifier; username/display name is required at signup but is non-unique.
- **D-03:** Store email and username/display name in the local profile. Refresh these copies from the verified Clerk identity during sign-in/provisioning; do not add an in-app email-change feature in this project.
- **D-04:** The verified-email environment allowlist bootstraps the local admin capability on first sign-in. Subsequent email changes must not silently grant or revoke admin privileges; changes to existing admin capability are explicit backend operations.
- **D-05:** Customer capability is the baseline. Merchant capability is additive after self-onboarding. Admin is a separate privileged capability and may coexist with customer use; do not model these as mutually exclusive account types.
- **D-06:** Authorization is enforced by the backend per action/resource. Frontend guards are not a security boundary. Continue to prove unauthenticated, role-matrix, and ownership denials with API tests.
- **D-07:** Do not cascade-delete local identity/business records needed to preserve orders and audit/integrity. Account deletion anonymizes personal profile data while retained orders keep an anonymized buyer reference.
- **D-08:** Merchant deletion/closure is staged rather than immediate destructive deletion: stop new sales when closure is accepted; retain store, merchant, and order records; allow only restricted actions needed to complete outstanding orders and payment/refund work; anonymize personal data when outstanding obligations are resolved, subject to legally required retention.
- **D-09:** Do not leave a closed merchant's products selling indefinitely, and do not strand in-flight orders/refunds by immediately removing the merchant's ability to perform necessary restricted completion actions. Exact state transitions, authorization, retention periods, and legally required exceptions are open for downstream research/planning; do not invent legal policy.
- **D-10:** ORM choice is deliberately not locked yet. Prisma remains the provisional baseline because project-specific research already exists, but Phase 1 research must perform a bounded Prisma-vs-MikroORM comparison before implementation.
- **D-11:** Limit that comparison to PostgreSQL migrations, NestJS integration, transactions and conditional-update support for checkout correctness, connection pooling, and maintenance/version stability. If MikroORM shows no concrete advantage on these project criteria, proceed with Prisma; do not broaden into an all-ORM survey. Verify current versions and recommendations during planning.

### the agent's Discretion
- Use standard, mature technical patterns within the approved product boundaries. Research current Clerk/NestJS integration and applicable database/provider details; do not silently change the identity provider, role model, deletion semantics, or approved stack.
- Design implementation details for staged closure (including states/authorization) during research/planning, but preserve the product outcomes above and escalate any legal/privacy policy decision that cannot be resolved from project context.

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within existing Phase 1 identity decisions and clarified an existing later-phase gallery-picker requirement.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AUTH-01 | Visitor can register through Clerk with email and a required display name | Clerk owns sign-up UI/config; required display name and email verification must be asserted there, while API uses verified session identity. No application credential endpoints. [CITED: https://clerk.com/docs/guides/sessions/session-tokens] |
| AUTH-02 | User can sign in and remain signed in across browser sessions | Clerk persists/manages session; web sends Clerk session token to API (bearer contract for cross-origin API). Backend validates each request. [CITED: https://clerk.com/docs/guides/sessions/session-tokens] |
| AUTH-03 | User can sign out from the application | Clerk frontend sign-out ends Clerk session; API need not mint/delete a separate app session. Verify UI logout + subsequent API 401 in later frontend/API journey. [CITED: https://clerk.com/docs/guides/sessions/session-tokens] |
| AUTH-04 | First sign-in provisions a local application user from verified Clerk identity (no webhooks) | Global Clerk guard verifies token, checks required verified claims, then concurrency-safe upsert by immutable `sub`; update local profile copies on each verified request. [CITED: https://clerk.com/docs/reference/backend/verify-token; https://clerk.com/docs/guides/sessions/customize-session-tokens] |
| AUTH-05 | A verified Clerk email matching the admin env-configured list grants platform-admin role on first sign-in | Include primary email and verified flag in signed session claims; normalize exact allowlist match; grant only on user creation. Do not auto-promote/revoke on later profile refresh. [CITED: https://clerk.com/docs/guides/sessions/jwt-templates; CONTEXT D-04] |
| AUTH-06 | User can delete their account; personal profile data is anonymized while order records are retained with an anonymized buyer reference | Local transaction anonymizes profile and retains stable pseudonymous internal buyer reference/order links; never cascade identity/business records. Account/merchant obligations and policy gaps remain open; do not encode a legal retention duration. [CITED: https://www.prisma.io/docs/orm/v7/prisma-client/queries/transactions; CONTEXT D-07..D-09] |
| OPS-01 | Every API endpoint enforces server-side input validation, authorization and resource ownership | Establish global DTO/schema validation, auth guard + capability guard and service/query ownership conventions; build API tests proving unauthenticated, malformed, wrong-role, and cross-owner denials. Phase 1 has no later business resources, so test with dedicated fixtures/test controller and carry the pattern into Phase 2+. [CITED: https://docs.nestjs.com/guards; https://docs.nestjs.com/techniques/validation; CODING_CONVENTIONS.md] |
| OPS-03 | Pino structured application logging and health endpoints provide useful local/demo operational visibility | Pino request logging with stable IDs/fields, redaction and no token/body secrets; health/readiness must reflect PostgreSQL state. [CITED: https://github.com/iamolegga/nestjs-pino; CODING_CONVENTIONS.md] |
| OPS-05 | Local development uses Docker/Docker Compose; a repeatable CI/CD pipeline runs on GitHub Actions (free-tier safe) | Compose API + PostgreSQL, healthcheck/dependency readiness, migrations before API readiness, and CI lint/typecheck/unit/integration tests on clean DB; no cloud deployment in this phase. [CITED: https://docs.docker.com/compose/; https://docs.github.com/actions] |
</phase_requirements>

# Phase 01: Platform Foundation & Identity - Research

**Researched:** 2026-11-16  
**Domain:** NestJS modular-monolith foundation, Clerk session verification, PostgreSQL ORM/schema setup  
**Confidence:** HIGH for official Clerk/Prisma/MikroORM behaviors; MEDIUM for project-specific claims/profile design and lifecycle decisions requiring owner resolution.

## Summary

Start with the approved TypeScript monorepo and NestJS API foundation, PostgreSQL and Docker Compose, then establish one shared request-security pipeline before later modules depend on it. Clerk is the identity authority: the browser signs up/in/out through Clerk, and the API validates Clerk session JWTs, resolves a local user, and derives all application roles and ownership from application data. No app passwords, JWT minting, refresh tokens, or webhook-based provisioning belong here. [CITED: https://clerk.com/docs/reference/backend/verify-token; https://clerk.com/docs/guides/sessions/session-tokens; CONTEXT D-01..D-06]

The bounded ORM comparison favors Prisma as provisional default, but does not show MikroORM incapable of required correctness. Both have versioned PostgreSQL migrations, Nest integration, transactions, conditional updates/query builders, and pooling. Prisma's strongest project-specific case is smaller initial integration surface, declarative schema/generated client, Nest's current official Prisma guide, and directly documented `updateMany` conditional writes plus interactive transaction behavior. MikroORM's strongest case is established Nest module/request-context integration, native query builder, and flexible Unit-of-Work transactions; its current v7 major upgrade is materially more configuration-heavy (ESM/Node, decorators moved, TS resolution changes) and integration is third-party. No criterion gives MikroORM a concrete must-have advantage for this application. **Recommendation: proceed with Prisma 7.10.1 exactly pinned**, `@prisma/client` and `@prisma/adapter-pg` matching 7.10.1, plus `pg`; recheck the pin and CLI config filename at execution. [CITED: https://docs.nestjs.com/data/prisma; https://docs.nestjs.com/data/mikroorm; https://www.prisma.io/docs/orm/v7/prisma-client/queries/transactions; https://mikro-orm.io/docs/transactions; https://mikro-orm.io/docs/upgrading-v6-to-v7; [VERIFIED: npm registry] npm view]

Critical plan caveats: default Clerk session claims do **not** include profile email/name, so configure small custom claims for primary email, display name and verified-email status (or retrieve the Backend User explicitly); never infer email verification from the mere presence of an email. Admin bootstrap must require the verified flag and only occur on initial local-user creation. Do not settle merchant closure's final state machine, anonymization timing, retention periods, or account-deletion/active-merchant interaction without product/privacy owner input. [CITED: https://clerk.com/docs/guides/sessions/session-tokens; https://clerk.com/docs/guides/sessions/jwt-templates; https://clerk.com/docs/guides/users/managing; CONTEXT D-04, D-07..D-09]

**Primary recommendation:** Use pinned Prisma 7.10.1 with `@prisma/adapter-pg`, direct connection for migration CLI and pooled runtime URL when pooler exists; integrate Clerk via a thin global Nest guard that validates signed claims then race-safe provisions a local record; lay down role/ownership helpers and negative API tests before business endpoints. [CITED: https://docs.nestjs.com/data/prisma; https://www.prisma.io/docs/orm/v7/prisma-client/setup-and-configuration/databases-connections/pgbouncer; https://clerk.com/docs/reference/backend/verify-token]

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Sign-up/sign-in/session persistence/sign-out UX | Browser / Client (Clerk UI/SDK) | Clerk service | Clerk owns credentials and session lifecycle; no application credential/session subsystem. [CITED: https://clerk.com/docs/guides/sessions/session-tokens] |
| Session token verification, local-user provisioning, admin bootstrap | API / Backend | Database / Storage | Backend guard validates token and maps signed identity into a durable local user; DB uniqueness and upsert make parallel initial requests safe. [CITED: https://clerk.com/docs/reference/backend/verify-token; https://www.prisma.io/docs/orm/v7/prisma-client/queries/crud] |
| Capabilities, authorization, resource ownership | API / Backend | Database / Storage | Guards resolve action-level capability; domain services scope each resource query to user/store ownership; frontend checks are usability only. [CITED: https://docs.nestjs.com/security/authorization; CONTEXT D-05/D-06] |
| Account deletion/anonymization and merchant closure | API / Backend | Database / Storage | One transactional service changes personal fields/lifecycle while preserving order/store references; retention/legal choices are not inferable. [CITED: https://www.prisma.io/docs/orm/v7/prisma-client/queries/transactions; CONTEXT D-07..D-09] |
| Input validation and API error boundary | API / Backend | Browser / Client | Server validates every HTTP body/query/param; browser validation is UX only. [CITED: https://docs.nestjs.com/techniques/validation] |
| Structured request logs and health/readiness | API / Backend | Database / Storage | API emits structured logs; readiness probes the DB connection rather than returning constant success. [CITED: https://github.com/iamolegga/nestjs-pino; CODING_CONVENTIONS.md] |
| Local dev environment and CI | Development / CI | Database / Storage | Compose provides local API+Postgres; GitHub Actions runs reproducible checks and DB-backed integration tests. [CITED: https://docs.docker.com/compose/; https://docs.github.com/actions] |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js | 24.22.2 available; project pin Node 24 LTS | Runtime/toolchain | Current machine has Node 24; compatible project decision is Node/pnpm isolation and Docker alignment. [VERIFIED: command -v/node --version; STACK.md] |
| NestJS (`@nestjs/core`, `@nestjs/common`, `@nestjs/platform-express`) | Registry latest 12.5.0; use compatible `^12` line, confirm exact packages during scaffold | API framework | Approved framework; official Nest docs support global guards, validation pipes, dependency injection and Prisma 7. [CITED: https://docs.nestjs.com/data/prisma; https://docs.nestjs.com/guards; [VERIFIED: npm registry] npm view] |
| PostgreSQL | Local approved `postgres:17-alpine`; target Postgres 16/17 | Persistence | Approved relational DB; constraints/transactions back identity, orders and ownership. [ASSUMED] Local image pin should be confirmed in execution; project STACK.md recommends Postgres 17. |
| Prisma CLI, Client, PostgreSQL adapter | `prisma@7.10.1`, `@prisma/client@7.10.1`, `@prisma/adapter-pg@7.10.1` exact | Schema/migrations/typed data access | Precisely pinned known-compatible triad, driver adapter architecture and documented conditional update/transactions; npm `latest` for CLI is 8.0.0-rc.33, so never unpinned. [CITED: https://docs.nestjs.com/data/prisma; https://www.prisma.io/docs/orm/v7/core-concepts/supported-databases/database-drivers; [VERIFIED: npm registry] npm view] |
| `pg` | 8.23.1 registry current | PostgreSQL driver/pool for Prisma adapter | Required driver for `@prisma/adapter-pg`; pooling options live in driver adapter in Prisma 7. [CITED: https://www.prisma.io/docs/orm/v7/prisma-client/setup-and-configuration/databases-connections/connection-pool; [VERIFIED: npm registry] npm view] |
| `@clerk/backend` | 3.29.0 | Verify Clerk session JWT | Official backend SDK provides `verifyToken()` / `authenticateRequest()`; networkless verification via configured JWT public key and `authorizedParties`. [CITED: https://clerk.com/docs/reference/backend/verify-token; https://clerk.com/docs/reference/backend/authenticate-request; [VERIFIED: npm registry] npm view] |
| Docker Compose v2 | Installed 2.36.0-desktop.1 | Local API + DB environment | One-command reproducible local environment is a phase success criterion. [VERIFIED: docker compose version; ROADMAP.md] |
| Vite+ (`vite-plus`) | STACK.md: 1.6.x; npm `latest` was checked as 1.6.0 per existing stack, local `vp` missing | Unified repo lint/format/test/task runner | Project-approved one-tool strategy; keep framework builds native (`nest build`); this environment still needs CLI bootstrap. [CITED: .planning/research/STACK.md; [VERIFIED: npm registry] npm view] |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@nestjs/config` | 12.1.1 registry current | Validated environment configuration | Load required env values at startup; fail fast for missing Clerk keys, admin allowlist, DB URLs and web origin. [CITED: https://docs.nestjs.com/techniques/configuration; [VERIFIED: npm registry] npm view] |
| `pino` | 10.4.0 | Structured logging | Mandatory logger; Nest integration may use `nestjs-pino` 5.3.1, but confirm Nest 12 compatibility on install. [CITED: CODING_CONVENTIONS.md; https://github.com/iamolegga/nestjs-pino; [VERIFIED: npm registry] npm view] |
| `@nestjs/swagger` | 12.1.2 registry current | OpenAPI generation | Add once endpoints are introduced; phase 1 can establish baseline OpenAPI emission but full API contract freeze is Phase 4. [CITED: https://docs.nestjs.com/openapi/introduction; [VERIFIED: npm registry] npm view] |
| `vitest` | 5.1.0 registry current | Unit/integration runner | Project-required direction; Slopcheck flagged SUS due to typosquat similarity to `vite`, but official Vitest docs/repo confirm legitimate package; keep with human-verify install checkpoint. [CITED: https://vitest.dev/; [VERIFIED: npm registry] npm view; WARNING: slopcheck flagged as suspicious — verify before using.] |
| `supertest` | 7.3.2 registry current | Nest API-level tests | Exercise route status/guards/validation/error response via HTTP. [CITED: https://docs.nestjs.com/fundamentals/testing; [VERIFIED: npm registry] npm view] |
| `class-validator` + `class-transformer` | Current versions verify at install | Request DTO/schema validation | Recommended single boundary-validation idiom for phase foundation, matching Nest's canonical `ValidationPipe` setup. Set transform+whitelist+forbidNonWhitelisted; add Swagger metadata to DTOs; do not mix Zod style in these modules. [CITED: https://docs.nestjs.com/techniques/validation; .planning/research/STACK.md] |
| `@nestjs/terminus` | Not recommended by default | Health checks | Add only if its module gives concrete value; a small explicit readiness check is enough for local/demo scope, avoiding unnecessary dep. [ASSUMED] |

### Bounded ORM comparison (D-10/D-11)

| Criteria | Prisma 7.10.1 | MikroORM 7.2.10 | Phase-specific conclusion |
|----------|--------------|-----------------|--------------------------|
| PostgreSQL migrations | `prisma migrate dev` creates reviewed versioned SQL in dev; `migrate deploy` applies committed migrations in test/prod. CLI should use direct URL when runtime is pooled. [CITED: https://www.prisma.io/docs/orm/v7/prisma-migrate/workflows/development-and-production; https://www.prisma.io/docs/orm/v7/prisma-client/setup-and-configuration/databases-connections/pgbouncer] | `@mikro-orm/migrations` provides generated and hand-edited TypeScript migrations with transactional defaults, snapshots and CLI up/down. [CITED: https://mikro-orm.io/docs/migrations] | Both satisfy migration requirements. Prisma workflow is already documented in project stack and current Nest integration docs; slight implementation/decision advantage Prisma, not feature exclusivity. |
| NestJS integration | No dedicated Prisma Nest package; Nest official docs show a single injected `PrismaService` with adapter, lifecycle hooks, module, tests. [CITED: https://docs.nestjs.com/data/prisma] | Official Nest docs cover third-party `@mikro-orm/nestjs`, DI repositories, autoLoadEntities, request context, lifecycle and tests. MikroORM docs show same. [CITED: https://docs.nestjs.com/data/mikroorm; https://mikro-orm.io/docs/usage-with-nestjs] | Both integrate well. MikroORM has more built-in request-scoped ORM context, but Prisma has simpler singleton service and matches project’s existing proposed architecture. |
| Transactions / conditional update | Interactive transactions, isolation/timeouts and atomic `updateMany` predicate + count are documented. For checkout, conditional `UPDATE ... WHERE stock >= qty` within short transaction maps directly. [CITED: https://www.prisma.io/docs/orm/v7/prisma-client/queries/transactions; https://www.prisma.io/docs/orm/v7/prisma-client/queries/crud] | `em.transactional`, pessimistic/optimistic locks, `nativeUpdate`, QueryBuilder and raw SQL support conditional update; transaction context must be request-isolated. [CITED: https://mikro-orm.io/docs/transactions; https://mikro-orm.io/docs/query-builder; https://mikro-orm.io/docs/entity-manager] | Both can implement checkout invariant. Prisma’s simple set-based `updateMany(where: stock >= qty)` and return count is a direct fit; MikroORM does not prove a concrete advantage here. Integration tests must use real PostgreSQL either way. |
| Connection pooling | Prisma 7 driver adapter delegates pool configuration to `pg`; default `max=10`, `connectionTimeoutMillis=0`, `idleTimeoutMillis=10s`; configure explicitly and share one client/pool. [CITED: https://www.prisma.io/docs/orm/v7/prisma-client/setup-and-configuration/databases-connections/connection-pool] | PostgreSQL driver uses `pg.Pool` and exposes driver options. Nest module owns ORM lifecycle; pool config can be supplied via driver config. [CITED: https://mikro-orm.io/docs/configuration; https://mikro-orm.io/docs/usage-with-nestjs] | Tie on capability. For Neon or another transaction pooler, app URL pooled and migration URL direct. With Prisma 7 pg adapter, set adapter runtime `DATABASE_URL` and `prisma7.config.ts` CLI `DIRECT_URL`. [CITED: https://www.prisma.io/docs/orm/v7/core-concepts/supported-databases/postgresql; https://neon.com/docs/connect/connection-pooling] |
| Maintenance / version stability | Prisma 7 stable; official policy says maintenance continues 18 months after Prisma 8 final release. As checked, `latest=8.0.0-rc.33`, `prev=7.10.1`; 7.10.1 exact pin is currently the Prisma 7 line. Biweekly release cadence. [CITED: https://www.prisma.io/docs/orm/release-status; https://www.prisma.io/docs/orm/v7/more/releases; [VERIFIED: npm registry] npm view] | MikroORM 7.2.10 stable released 2026-11-16; GitHub security policy supports only latest major/minor. Current ORM updates are frequent. MikroORM Nest adapter latest 7.1.0 released independently; check peer compatibility. v7 major upgrade required ESM/Node 22.17+, TS moduleResolution update and separate decorators package. [CITED: https://github.com/mikro-orm/mikro-orm/releases; https://github.com/mikro-orm/nestjs/releases; https://github.com/mikro-orm/mikro-orm/security/policy; https://mikro-orm.io/docs/upgrading-v6-to-v7; [VERIFIED: npm registry] npm view] | Neither is unsupported; both are moving ecosystems. Prisma benefit is exact known pin and current official Nest guide, while MikroORM benefits are not required by the target workload. Prefer Prisma under D-11, but maintain pins/CI lockfile and re-verify. |

**Decision recommendation:** Prisma 7.10.1 is a recommendation, not a locked user decision. MikroORM meets the criteria but no concrete project-specific advantage offsets the switch cost. If owner/planner chooses MikroORM, align every `@mikro-orm/*` package to the same 7.2.10 line, use `@mikro-orm/nestjs` 7.1.0, explicitly set v7 decorator/metadata/module configuration, and prove the conditional stock write via a real-Postgres concurrency test. [CITED: D-10/D-11; official docs above; [VERIFIED: npm registry] npm view]

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Prisma 7.10.1 | MikroORM 7.2.10 | Credible alternative with native Nest request-context integration, UoW, and SQL query-builder. Adds ORM-specific identity map/request context, decorator, CLI discovery and v7 ESM/config complexity; no required checkout or migration capability unavailable in Prisma. [CITED: https://docs.nestjs.com/data/mikroorm; https://mikro-orm.io/docs/upgrading-v6-to-v7] |
| Prisma 7.10.1 | Prisma 8 RC / unpinned npm `latest` | Do not use: as of research date npm `latest` resolves Prisma 8.0.0-rc.33, while exact project baseline is 7.10.1; mismatch risks CLI/API incompatibility. [VERIFIED: npm registry] npm view; [CITED: https://docs.nestjs.com/data/prisma] |
| Pino | Nest console Logger alone | Does not meet mandatory structured Pino logging direction. Use Nest/Pino adapter or adapt Nest logger to Pino. [CITED: CODING_CONVENTIONS.md; .planning/research/STACK.md] |
| One validation style | Mixed DTO + schema libraries per route | Creates inconsistent contract/validation behavior; choose one global boundary approach. [CITED: https://docs.nestjs.com/techniques/validation; .planning/research/STACK.md] |

**Installation (Prisma-recommended option; pnpm workspace package assignment should be in plan):**

```bash
pnpm add -F api @nestjs/core@^12 @nestjs/common@^12 @nestjs/platform-express@^12 \
  @nestjs/config @nestjs/swagger@^12 @clerk/backend@^3 \
  @prisma/client@7.10.1 @prisma/adapter-pg@7.10.1 pg pino nestjs-pino
pnpm add -D -F api prisma@7.10.1 vitest@^5 supertest@^7 @types/supertest typescript@6.0.3
```

Commands are illustrative only: `pnpm` availability is checked locally, but `vp` is missing; exact package names/commands must be adapted to the eventual Vite+ workspace. Do not install ORM alternatives or both validation stacks. `[VERIFIED: npm registry]` current versions listed above; package sources confirmed by official docs/repositories; slopcheck audit follows.

**Version verification:** `npm view` on 2026-11-16 confirmed `prisma@7.10.1`, `@prisma/client@7.10.1`, `@prisma/adapter-pg@7.10.1`, `pg@8.23.1`, `@clerk/backend@3.29.0`, `@nestjs/core@12.5.0`, `@nestjs/config@12.1.1`, `@nestjs/swagger@12.1.2`, `pino@10.4.0`, `nestjs-pino@5.3.1`, `vitest@5.1.0`, `supertest@7.3.2`, and `vite-plus@1.6.0`. Prisma 7.10.1 release is dated 2026-10-15 (official GitHub release); MikroORM 7.2.10 official GitHub release is 2026-11-16; exact npm publication timestamps could not be retrieved from the registry CLI in this session. [VERIFIED: npm registry] + [CITED: https://github.com/prisma/orm/releases/tag/7.10.1; https://github.com/mikro-orm/mikro-orm/releases/tag/v7.2.10]

## Package Legitimacy Audit

> Required external-package audit was run best-effort with slopcheck 0.6.1 and npm registry checks. All recommended packages were confirmed by authoritative package documentation/repository and npm presence; registry presence alone is not used as legitimacy evidence. `vitest` is retained but flagged SUS by the tool and requires human verification before install. `vite-plus` returned an informational name-pattern flag only; official project docs/repo establish its legitimacy.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| `@nestjs/core` 12.5.0 | npm | Since 2017 | Not checked | github.com/nestjs/nest | OK | Approved [VERIFIED: npm registry; CITED: Nest docs] |
| `@nestjs/common` / `@nestjs/platform-express` 12.5.0 | npm | Since 2017 | Not checked | github.com/nestjs/nest | OK | Approved [VERIFIED: npm registry; CITED: Nest docs] |
| `@nestjs/config` 12.1.1, `@nestjs/swagger` 12.1.2 | npm | Since 2019 / 2017 | Not checked | github.com/nestjs/config; github.com/nestjs/swagger | OK | Approved [VERIFIED: npm registry; CITED: Nest docs] |
| `prisma` 7.10.1 / `@prisma/client` 7.10.1 / `@prisma/adapter-pg` 7.10.1 | npm | Since 2016 / 2020 / 2023 | Not checked | github.com/prisma/orm | OK | Approved; exact pins required [VERIFIED: npm registry; CITED: Prisma/Nest docs] |
| `pg` 8.23.1 | npm | Since 2010 | Not checked | github.com/brianc/node-postgres | OK | Approved [VERIFIED: npm registry; CITED: Prisma docs] |
| `@clerk/backend` 3.29.0 | npm | Since 2022 | Not checked | github.com/clerk/javascript | OK | Approved [VERIFIED: npm registry; CITED: Clerk docs] |
| `pino` 10.4.0 / `nestjs-pino` 5.3.1 | npm | Since 2016 / 2019 | Not checked | github.com/pinojs/pino; github.com/iamolegga/nestjs-pino | OK | Approved [VERIFIED: npm registry; CITED: project convention / package docs] |
| `vitest` 5.1.0 | npm | Since 2021 | Not checked | github.com/vitest-dev/vitest | SUS: typosquat-risk similarity to `vite` | Flagged — planner must add `checkpoint:human-verify` before install; legitimate official repo/docs identified, confirm owner/tool preference first [VERIFIED: npm registry; CITED: https://vitest.dev/] |
| `supertest` 7.3.2 | npm | Since 2012 | Not checked | github.com/ladjs/supertest | OK | Approved [VERIFIED: npm registry; CITED: Nest testing docs] |
| `vite-plus` 1.6.0 | npm | Since 2022 | Not checked | official VoidZero repo/docs per STACK.md | OK with informational `-plus` name heuristic | Approved; no SUS/SLOP verdict [VERIFIED: npm registry; CITED: https://viteplus.dev/; STACK.md] |
| `@mikro-orm/core`, `@mikro-orm/nestjs`, `@mikro-orm/postgresql`, `@mikro-orm/migrations`, `@mikro-orm/decorators` | npm | Since 2017+ (registry release history not audited) | Not checked | github.com/mikro-orm/mikro-orm; github.com/mikro-orm/nestjs | OK each | Comparison-only candidate; not in recommendation install set [VERIFIED: npm registry; CITED: official MikroORM/Nest docs] |

**Packages removed due to slopcheck [SLOP] verdict:** none.  
**Packages flagged as suspicious [SUS]:** `vitest` — planner inserts `checkpoint:human-verify` before install.  
**Postinstall review:** `npm view <package> scripts.postinstall` returned no postinstall scripts for the checked set (empty registry output); no network/filesystem postinstall behavior found. [VERIFIED: npm registry]

## Architecture Patterns

### System Architecture Diagram

```text
Visitor/customer / merchant / admin browser
  ├─ Clerk signup (email + required display name) / signin / signout
  └─ Clerk session JWT ── Authorization: Bearer ─────────────────────────┐
                                                                         ▼
                                                              NestJS API request
                                                                         │
   request id + Pino logging ──> body/query/param validation              │
                                                                         ▼
  Public-route decision ── public health/docs? ──yes──> handler           │
          │ no                                                            │
          ▼                                                               │
  Clerk guard: extract bearer token → verify signature/exp/nbf/azp         │
          │ invalid → 401                                                  │
          ▼ valid                                                         │
  Validate signed sub + email + displayName + emailVerified claims        │
          │ missing/incomplete → explicit profile-completion response      │
          ▼                                                               │
  Identity service: unique Clerk ID lookup/upsert + refresh profile        │
  first insert only: verified email ∈ allowlist → add platform-admin      │
          ▼                                                               │
  Local user + capabilities attached to request                           │
          │                                                               │
  capability guard → controller → domain service / ownership-scoped query │
          │ denied → 403 or non-disclosing 404                            │
          ▼                                                               │
  PostgreSQL transaction/constraints/migrations ◄─────────────────────────┘
          │
          ├─ /health readiness checks database; emits dependency status
          ├─ account deletion: retained identity/order refs + anonymized profile
          └─ merchant closure: staged stop-sales/restricted completion; exact lifecycle policy open

  Docker Compose: API + PostgreSQL; GitHub Actions: install → checks → migrations → tests
```

Data-flow points and boundaries follow verified Clerk token behavior and project roadmap. Session custom claims are not default and must be configured or resolved from Clerk API. [CITED: https://clerk.com/docs/reference/backend/verify-token; https://clerk.com/docs/guides/sessions/session-tokens; ROADMAP.md]

### Recommended Project Structure

```text
apps/
└── api/
    ├── prisma/                   # schema + versioned SQL migrations
    └── src/
        ├── main.ts               # global pipe/filters, Pino, shutdown hooks
        ├── app.module.ts
        ├── common/
        │   ├── auth/             # Clerk guard, current-user decorator, public metadata
        │   ├── authorization/    # capability metadata/guard; ownership stays in services
        │   ├── config/            # env schema, allowlist, origins
        │   ├── database/          # one Prisma provider/client lifecycle
        │   ├── errors/            # error mapping/filter
        │   └── validation/        # global DTO/schema pipe setup
        ├── identity/              # local user resolution, profile, deletion
        ├── health/                # liveness/readiness routes
        └── test/                  # API fixtures and DB-backed suites if chosen
```

The exact folder names are guidance, not established project convention; the repository is unscaffolded. Keep modules domain-oriented, use one Prisma service, no generic repository abstraction, and no shared package until two real consumers exist. [CITED: CODING_CONVENTIONS.md; .planning/research/ARCHITECTURE.md; CONTEXT.md]

### Pattern 1: Verified Clerk session → local user provisioning

**What:** A global Nest guard extracts bearer token (and only accept `__session` cookie if a same-origin need is explicitly supported), calls Clerk SDK verification with configured public JWT key and `authorizedParties`, validates expected claims, resolves local account by immutable Clerk `sub`, then attaches local user/capabilities to request. [CITED: https://clerk.com/docs/reference/backend/verify-token; https://clerk.com/docs/guides/sessions/manual-jwt-verification]

**When to use:** Every protected API request; no webhook endpoint and no UI-only auth boundary. Use explicit public metadata for health and truly public routes. [CITED: D-01, D-06; https://docs.nestjs.com/guards]

**Example (shape only; claim names must be standardized in Clerk dashboard and types):**

```typescript
// Source: https://clerk.com/docs/reference/backend/verify-token
const claims = await verifyToken(token, {
  jwtKey: config.clerkJwtKey,
  authorizedParties: config.webOrigins,
});

if (!claims.sub) throw new UnauthorizedException();
const user = await identityService.resolveVerifiedIdentity({
  clerkUserId: claims.sub,
  email: claims.primaryEmail,
  emailVerified: claims.emailVerified === true,
  displayName: claims.displayName,
});
request.user = user; // app roles come only from local DB
```

Do not rely on Clerk default session claims for email/name. Either add small custom claims using `{{user.primary_email_address}}`, `{{user.full_name}}`, `{{user.email_verified}}` and assert presence/type, or fetch Clerk Backend User and inspect `primaryEmailAddress.verification.status === 'verified'`; the API fetch adds latency/rate-limit dependency, while custom claims may lag until token refresh (about 60 seconds). Verify whether the boolean applies to the primary address under the configured Clerk instance/signup behavior before locking admin eligibility. [CITED: https://clerk.com/docs/guides/sessions/session-tokens; https://clerk.com/docs/guides/sessions/jwt-templates; https://clerk.com/docs/guides/sessions/customize-session-tokens; https://clerk.com/docs/reference/backend/types/backend-user; https://clerk.com/docs/reference/backend/types/backend-email-address]

### Pattern 2: Concurrent-safe bootstrap and role separation

**What:** `users.clerk_user_id` is unique; initial resolution uses an atomic upsert/on-conflict path. On create only, if normalized verified email matches normalized `ADMIN_EMAILS`, grant application admin capability. Existing user email/display copies refresh from verified Clerk identity, but admin grants/removals are explicit administrative changes only. Customer baseline is implicit; merchant capability derives from later store ownership/active state; admin can coexist. [CITED: D-02..D-05; https://www.prisma.io/docs/orm/v7/prisma-client/queries/crud; https://www.prisma.io/docs/orm/v7/prisma-client/queries/transactions]

**Pitfall:** not every guard invocation should write profile fields. A conditional update or normalized compare limits writes, and concurrent first requests must not duplicate users or race promotion. Do not let a returning user matching a changed allowlist silently gain admin. [CITED: D-04; Prisma CRUD docs above]

### Pattern 3: Resource authorization and ownership-scoped query

**What:** global auth guard establishes identity; action capability guard establishes permission; resource service query applies owner predicate in the same database query (e.g. `where: { id, store: { ownerUserId: currentUser.id } }`). Return non-disclosing 404 for foreign resources if that is the project-wide error policy. [CITED: https://docs.nestjs.com/security/authorization; CODING_CONVENTIONS.md; .planning/research/ARCHITECTURE.md]

**When to use:** Every protected mutation and read of private resources; an endpoint must not fetch by attacker-supplied ID, then rely on client or a later guard to filter. For this foundation phase, prove mechanics via role/ownership test fixtures; business store/product/order endpoints start in later phases. [CITED: D-06; ROADMAP.md; TESTING_CONVENTIONS.md]

### Pattern 4: Soft-retained identity lifecycle

**What:** Internal immutable app user ID remains as buyer reference; personal fields are replaced with non-identifying values and external Clerk linkage is disabled/removed so future still-valid tokens cannot resolve/re-provision the anonymized user. Preserve order references and business records. Perform local changes transactionally. If Clerk account deletion is requested, coordinate/revoke Clerk identity without allowing a failed provider call to roll back already-committed anonymization or re-enable access. [CITED: D-07; https://www.prisma.io/docs/orm/v7/prisma-client/queries/transactions; https://clerk.com/docs/reference/backend/user/delete-user]

**Important anti-reprovision detail:** if anonymization nulls `clerk_user_id`, a still-valid signed token with that same `sub` may hit the guard and create a new local user. Preserve a non-PII tombstone/identity-subject mapping (with a deleted/anonymized state) that the guard can deny, or prove another permanent deny/revocation strategy. Do not both discard the mapping and claim that future signed tokens cannot re-provision. The subject's own privacy classification/retention must be confirmed; it is an unresolved privacy question, not a legal conclusion. [CITED: Clerk's networkless verification validates signed claims: https://clerk.com/docs/reference/backend/verify-token; CONTEXT D-07; [ASSUMED] tombstone approach]

Whether to call Clerk `deleteUser()` synchronously, use Clerk's own account deletion, or perform a local-only anonymization followed by provider action is a consequential boundary decision; the backend Clerk API call requires secret credentials, and a networkless verifier does not consult current Clerk session state. A token already issued can remain signature-valid until expiry; browser sign-out removes the browser's session token, but is not proof of immediate server-side revocation for a copied bearer token. Confirm acceptable residual lifetime and deletion sequencing without adding a custom refresh-token system. [CITED: https://clerk.com/docs/reference/backend/user/delete-user; https://clerk.com/docs/reference/backend/verify-token; https://clerk.com/docs/guides/sessions/session-tokens; [ASSUMED] token-revocation policy]

**Owner resolution (2026-11-17, Plan 01-03 Task 2 — supersedes the open-item assumption above):** the owner selected `keyed-permanent-tombstone-local-first`. A permanent keyed pseudonymous tombstone (HMAC of the Clerk external `sub` with a server-side secret, retaining no raw subject/email/PII) is written in the same local transaction as anonymization and is authoritative for immediately denying re-provisioning. Clerk provider session revocation is attempted after/alongside the local transaction with retry. **Fail closed:** a failed Clerk session revocation leaves the subject locked out locally, is surfaced/retried, and never restores local access; no legal retention duration was supplied. Plans 01-06/01-07/01-08 implement this contract. [CITED: CONTEXT D-07; owner resolution recorded in `.planning/PROJECT.md` and `.planning/phases/01-platform-foundation-identity/01-CONTEXT.md`]

### Anti-Patterns to Avoid

- **Use Clerk metadata/role claim as application authorization:** application role state belongs in local DB and must be queried/controlled server-side. [CITED: D-04..D-06]
- **Assume email/name are present in default token:** documented default claim set has `sub`, `sid`, `azp`, times and others, not primary email or display name. Configure custom claim or explicit Backend API lookup. [CITED: https://clerk.com/docs/guides/sessions/session-tokens]
- **Bootstrap admin on email equality alone:** require verified email, normalize comparison, apply only once at first local-user creation; never implicit demotion/promotion from profile refresh. [CITED: D-04; https://clerk.com/docs/guides/sessions/jwt-templates]
- **Treat `customer | merchant | admin` as enum account type:** customer is baseline, merchant additive, admin independent capability. [CITED: D-05]
- **Treat authn as complete authorization:** server-side object ownership must be part of service queries; route-level role check alone is insufficient. [CITED: D-06; CODING_CONVENTIONS.md]
- **Cascade delete identities, stores, orders or audit references:** anonymize personal fields while retaining records. [CITED: D-07..D-09]
- **Use `prisma db push` / ORM schema sync as migrations:** all shared schema changes need reviewed, versioned migration history; never auto-sync. [CITED: https://www.prisma.io/docs/orm/v7/prisma-migrate/workflows/development-and-production; CODING_CONVENTIONS.md]
- **Use a pooled Postgres URL for CLI migrations:** set a separate direct URL; pooled runtime URL belongs to the app driver. [CITED: https://www.prisma.io/docs/orm/v7/prisma-client/setup-and-configuration/databases-connections/pgbouncer; https://neon.com/docs/connect/connection-pooling]
- **Keep request body, bearer token, cookies or secret config in Pino logs:** redact/omit credentials and sensitive profile data. [CITED: CODING_CONVENTIONS.md; OWASP ASVS V16: https://owasp.org/www-project-application-security-verification-standard/]
- **Implement assumed legal retention rules:** preserve owner-set product outcomes and escalate legal retention periods/exceptions instead of inventing durations. [CITED: D-07..D-09; GSD_WORKFLOW.md]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Clerk password/session lifecycle, JWT issuance, refresh | Credential tables, custom auth tokens, refresh endpoint | Clerk frontend/backend session APIs; verify Clerk-issued token | These are explicit out-of-scope boundaries; custom lifecycle creates security state and drift. [CITED: D-01; https://clerk.com/docs/reference/backend/verify-token] |
| JWT signature/time/origin validation | Decode-only JWT or custom signature checks | `@clerk/backend` `verifyToken()` / `authenticateRequest()` | Official SDK verifies signature/exp/nbf and supports authorized-party checks. [CITED: https://clerk.com/docs/reference/backend/verify-token] |
| Relational persistence/migration/type API | Handwritten generic SQL repository layer or custom migration runner | Prisma 7.10.1 schema, migrations and generated client | Maintained tool provides migration history/typed query layer; SQL remains available for explicitly justified edge. [CITED: https://docs.nestjs.com/data/prisma] |
| HTTP validation and global error translation | Per-controller ad hoc `if` trees / each endpoint's own response envelope | Nest global validation pipe with one DTO/schema convention + global exception filter | Reuse Nest lifecycle primitives consistently and reject unknown fields. [CITED: https://docs.nestjs.com/techniques/validation; CODING_CONVENTIONS.md] |
| Structured request logging | `console.log` + manually serialized request bodies | Pino / `nestjs-pino` request context and explicit safe field whitelist | Stable structured fields, log correlation, redaction, and no credential leakage. [CITED: CODING_CONVENTIONS.md; https://github.com/iamolegga/nestjs-pino] |
| Compose orchestration | Shell scripts that start services with timing sleeps | Docker Compose healthchecks + `depends_on: condition: service_healthy` where supported | Deterministic startup/readiness, no sleeps. [CITED: https://docs.docker.com/compose/; TESTING_CONVENTIONS.md] |

**Key insight:** For this foundational phase, security correctness comes from composing mature verification, DB constraints, framework guards/validation, and real-DB tests—not adding more auth middleware or generic abstractions. An ORM cannot itself make ownership safe; ownership must be an explicit database query predicate and tested against cross-owner fixtures. [CITED: D-06; CODING_CONVENTIONS.md; TESTING_CONVENTIONS.md]

## Runtime State Inventory

Omitted: this is a greenfield scaffold, not a rename/refactor/migration of an existing deployed system. Repository context explicitly reports no application code or reusable assets. [CITED: 01-CONTEXT.md §Existing Code Insights]

## Common Pitfalls

### Pitfall 1: Missing claims break first-login provisioning/admin bootstrap
**What goes wrong:** A valid Clerk token contains only `sub` and session data; provisioner expects email/name and either fails, invents profile data, or admin list check cannot establish verified email.  
**Why it happens:** Primary email/name/verification are not part of default session claims.  
**How to avoid:** Configure only required small custom claims (primary email, full name/display name, email-verified boolean) and enforce runtime types/verification; alternatively call Backend API and inspect primary email verification status, with explicit rate/latency tradeoff. Assert actual configured sign-up and claims in integration setup.  
**Warning signs:** `undefined` profile in the first request; admin test succeeds with unverified email; no test for missing claims. [CITED: https://clerk.com/docs/guides/sessions/session-tokens; https://clerk.com/docs/guides/sessions/jwt-templates; https://clerk.com/docs/reference/backend/types/backend-email-address]

### Pitfall 2: Unvalidated authorized parties / token-source ambiguity
**What goes wrong:** A token from unintended origin or cookie leaks across subdomains and is accepted; cross-origin browser requests omit token or rely accidentally on cookies.  
**Why it happens:** Token is checked for signature but not permitted origin; `azp` may be missing if original frontend origin is absent.  
**How to avoid:** Explicit `authorizedParties` allowlist for dev/prod frontend origins, set bearer token transport for web→API, test valid/invalid origin and absent/expired token; apply CORS allowlist deliberately. Never log token.  
**Warning signs:** `authorizedParties` omitted; wildcard CORS with credentials; ambiguous cookie-vs-bearer precedence. [CITED: https://clerk.com/docs/reference/backend/verify-token; https://clerk.com/docs/guides/sessions/manual-jwt-verification]

### Pitfall 3: Provisioning race or promotion-by-profile-update
**What goes wrong:** parallel first API calls create duplicates or returning email update grants/revokes privileged role unexpectedly.  
**Why it happens:** lookup-then-insert race and role bootstrap mixed into profile refresh.  
**How to avoid:** database unique Clerk ID, upsert/conflict semantics (handle race deterministically), and role write only in first-create branch; test parallel initial requests and changed email for pre-existing admin/non-admin. [CITED: D-02/D-04; Prisma transaction and CRUD docs]

### Pitfall 4: Deletion cascades or account re-provisioning
**What goes wrong:** orders/buyer references disappear, or a still-valid Clerk token creates a fresh local user after the prior user was anonymized.  
**Why it happens:** cascade FK actions or leaving external subject linkage available.  
**How to avoid:** preserve stable internal ID/order references, anonymize profile in transaction, remove/disable external identity association and deny deleted identity. Explicitly test retained orders and repeated request after deletion. Coordinate Clerk revocation; surface policy ambiguity. [CITED: D-07; https://clerk.com/docs/reference/backend/user/delete-user]

### Pitfall 5: Premature merchant closure policy
**What goes wrong:** stop-sale and outstanding fulfillment/refund access are inconsistent, or implementation assumes retention periods/legal exceptions.  
**Why it happens:** lifecycle is multi-domain but only product outcome is settled.  
**How to avoid:** define minimum technical state model with explicit policy checkpoint: closure-requested/accepted, no-new-sales, restricted outstanding-order actions, obligations-resolved, personal-data anonymization. Treat labels/transitions/authority and retention duration as provisional until product owner resolves exact open questions; never make anonymization job run on guessed time period.  
**Warning signs:** deletion cascades immediately; active products remain purchasable; merchant loses refund completion access; hard-coded retention date with no authoritative source. [CITED: CONTEXT D-08/D-09; GSD_WORKFLOW.md]

### Pitfall 6: ORM CLI/runtime URL inversion and Prisma 7 config drift
**What goes wrong:** migration tool routes through transaction pooler or runtime DB uses direct URL at scale; pool default has no acquire timeout; app fails only on first query.  
**Why it happens:** Prisma 7 uses driver adapter config at runtime and `prisma7.config.ts` (from 7.10+) for CLI; two configuration surfaces.  
**How to avoid:** have `DATABASE_URL` pooled/runtime and `DIRECT_URL` direct/CLI, ensure exactly one Prisma config (if using 7.10 CLI may name it `prisma7.config.ts`), validate env at startup, set `pg` pool max/timeouts explicitly and test migration command on clean DB. Do not cargo-cult `pgbouncer=true`; Prisma currently recommends omit it on PgBouncer >=1.21, but provider-specific Neon config must be verified. [CITED: https://www.prisma.io/docs/orm/v7/core-concepts/supported-databases/postgresql; https://www.prisma.io/docs/orm/v7/prisma-client/setup-and-configuration/databases-connections/pgbouncer; https://neon.com/docs/guides/prisma]

### Pitfall 7: Mocks falsely prove security or migration behavior
**What goes wrong:** mocked guard/Prisma tests are green while SQL constraints, transaction, scope predicates, or actual JWT verification is wrong.  
**Why it happens:** unit tests cannot observe database or HTTP integration behavior.  
**How to avoid:** unit-test pure policy; integration/API test real PostgreSQL and test-only Clerk signed tokens/fixtures; migrate empty DB in CI; include unauthorized, invalid input, wrong role, wrong owner, profile provisioning, allowlist, delete-retention cases. No tests depend on demo seed or arbitrary sleep. [CITED: TESTING_CONVENTIONS.md; ROADMAP.md]

### Pitfall 8: Dependency pin mismatch and orphan `vitest` package
**What goes wrong:** unpinned Prisma CLI resolves to RC major; packages under Nest/MikroORM line mismatch; typo-risk tool warning skipped.  
**Why it happens:** rapidly moving 2026 stack and mixed version streams.  
**How to avoid:** pin Prisma trio exactly, commit lockfile, install one aligned Nest major and chosen ORM major, gate `vitest` with human verification due to slopcheck SUS verdict, test supported package manager and build in CI. [VERIFIED: npm registry; slopcheck 0.6.1; CITED: https://docs.nestjs.com/data/prisma; MikroORM upgrading guide]

## Code Examples

### Prisma 7 Nest provider with `pg` pool (conceptual; test against scaffolded ESM/build target)

```typescript
// Source: https://docs.nestjs.com/data/prisma
// Prisma v7 pool fields are pg/adapter settings, not legacy URL query params.
const adapter = new PrismaPg({
  connectionString: config.getOrThrow<string>('DATABASE_URL'), // runtime pooled URL
  max: 5,
  connectionTimeoutMillis: 5_000,
  idleTimeoutMillis: 10_000,
});
super({ adapter });
```

The pool `max` value is an initial conservative example, not a measured target; calculate per API instance × pool max against Postgres cap. Prisma docs' v7 `pg` adapter default is max 10 and zero connection wait timeout; do not assume old v6 connection URL parameters still set these knobs. [CITED: https://www.prisma.io/docs/orm/v7/prisma-client/setup-and-configuration/databases-connections/connection-pool]

### Conditional update / concurrency invariant (foundation pattern to establish for later checkout)

```typescript
// Source: https://www.prisma.io/docs/orm/v7/prisma-client/queries/crud
const result = await tx.product.updateMany({
  where: {
    id: productId,
    status: 'PUBLISHED',
    stockQuantity: { gte: requestedQuantity },
  },
  data: { stockQuantity: { decrement: requestedQuantity } },
});
if (result.count !== 1) throw new ConflictException('Insufficient stock');
```

This is an example for downstream checkout phase, not a Phase 1 product feature. It demonstrates Prisma's condition-in-update primitive that motivated D-11 comparison. [CITED: Prisma CRUD docs; .planning/research/ARCHITECTURE.md]

### NestJS global validation and public-vs-protected guard conventions

```typescript
// Source: https://docs.nestjs.com/techniques/validation
app.useGlobalPipes(new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
  forbidUnknownValues: true,
}));
```

Keep actual guard ordering/metadata implementation in a small shared auth/authorization package under the API; do not mark all controllers public and selectively remember to protect them. Make public status explicit. [CITED: https://docs.nestjs.com/guards; CODING_CONVENTIONS.md]

### Structured logging constraints

```typescript
// Source: CODING_CONVENTIONS.md; nestjs-pino package documentation
logger.info({ requestId, userId, action: 'identity.provisioned' }, 'identity resolved');
// Never log Authorization, __session, Clerk secret/JWT key, raw request body,
// private profile fields, or payment/card data.
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Prisma v6 runtime engine/pool URL settings and implicit generator output | Prisma v7 driver-adapter based Prisma Client; explicit generator output and adapter-owned pool config; Prisma 7.10+ may generate `prisma7.config.ts` | Prisma 7; 7.10 config naming verified in current official docs/Neon guide | Explicitly wire `@prisma/adapter-pg`, generate client, configure direct URL for CLI and pooled URL for app. [CITED: https://docs.nestjs.com/data/prisma; https://www.prisma.io/docs/orm/v7/prisma-client/setup-and-configuration/generating-prisma-client; https://neon.com/docs/guides/prisma] |
| Prisma `latest` assumed to be stable compatible major | `prisma` npm latest currently points to Prisma 8.0.0-rc.33; Prisma 7.10.1 is prev | Verified npm tags on 2026-11-16 | Exact pin both CLI and runtime package to 7.10.1; never use unqualified `npm install prisma`. [VERIFIED: npm registry] |
| Use public webhook to sync local account | Provision on first authenticated API request, no webhook | Owner decision for this project | Less public endpoint/replay/signature complexity, but must make upsert race-safe and provide session claims. [CITED: D-01..D-04] |
| Clerk email assumed in default session JWT | Default token is intentionally compact; use configured custom claims or Backend User API | Current Clerk docs | Explicit email/fullName/verified claim setup is a planning task, with claim freshness/size tradeoffs. [CITED: https://clerk.com/docs/guides/sessions/session-tokens; https://clerk.com/docs/guides/sessions/customize-session-tokens] |
| MikroORM v6 Nest starter copied without v7 changes | MikroORM v7 is native ESM, decorators split, Node >=22.17 and TS >=5.8, moduleResolution node20/nodenext/bundler | MikroORM v7 upgrade guide | If chosen, update Nest TS config and package imports; cannot blindly use older snippets. [CITED: https://mikro-orm.io/docs/upgrading-v6-to-v7] |

**Deprecated/outdated:**
- Prisma CLI package `latest` as a floating dependency: it currently resolves to 8.0.0-rc.33, not the planned Prisma 7 baseline. Exact pin 7.10.1. [VERIFIED: npm registry]
- Prisma 6 `directUrl` field in `schema.prisma`: Prisma 7 configuration lives in root CLI config; Nest runtime config is passed to driver adapter. [CITED: https://www.prisma.io/docs/orm/v7/core-concepts/supported-databases/postgresql]
- MikroORM v6 imports/decorator exports and default CJS/`moduleResolution: node` configuration: v7 moved decorators and requires modern ESM-aware resolution. [CITED: https://mikro-orm.io/docs/upgrading-v6-to-v7]
- Treating Clerk's cookie as the cross-origin API auth transport by default: approved later web/API integration uses bearer token; cookie support increases CSRF/CORS complexity and must be deliberate. [CITED: CONTEXT.md §Integration Points; https://clerk.com/docs/guides/sessions/manual-jwt-verification]

## Customer / Merchant / Admin Journey Modeling (required contract input)

These are journey models, not a demand to implement later-phase UI or all business APIs in Phase 1. Backend planning must give the later API contracts consumers and actor states to target. Exact endpoint names remain provisional until OpenAPI freeze. [CITED: ROADMAP.md §Phase 1; GSD_WORKFLOW.md]

| Actor | Journey stages | API contract touchpoints to plan/document | Authz/data invariants |
|-------|----------------|------------------------------------------|----------------------|
| Customer | Visit → Clerk signup with required email/display name → verify email/sign in → first protected API request provisions local customer → read own profile → later browse/cart/checkout/order history → request account deletion | Phase 1: Clerk-hosted signup/session, `GET /me` (or equivalent), `DELETE /me`; later: public catalogue, own cart/checkout/orders APIs | Authenticated API uses local user; never trust client email/role; ownership by local user ID; deletion anonymizes but does not erase order buyer history. [CITED: AUTH-01..06; .planning/research/ARCHITECTURE.md] |
| Merchant | Customer signs in → later self-onboards store → manage own store/products/inventory → receive own order and complete allowed fulfillment/refund work → request staged closure → sales stop, restricted outstanding obligations finish, retained store/order records | Phase 1 models `store.owner_user_id`, merchant capability derived from owned active store, and eventual status fields; Phase 2 owns onboarding/product endpoints; Phase 3 owns seller orders; Phase 6 UI uses frozen API | Role additive; all reads/mutations filtered by own store; closure blocks new sales but preserves necessary fulfilment/refund actions; exact states and authority unresolved by D-09. [CITED: MERC-01..08; ROADMAP.md; CONTEXT D-05, D-08/D-09] |
| Platform admin | Clerk signup/signin with email → verified allowlist matched on first local provision → admin capability coexists with customer → later admin views/manages users/merchants/categories/orders → explicit capability changes | Phase 1: admin bootstrap and protected `GET /me` capability; Phase 4 owns admin-management endpoints. Phase 1 may expose a test/admin-only operation only if required for proving explicit role changes. | `ADMIN_EMAILS` normalized/validated configuration; require verified email; later profile updates never mutate admin status; all privileged APIs require backend capability. [CITED: AUTH-05; ADMN-01..06; CONTEXT D-04..06] |

At minimum document these endpoint/decision questions for later planning: whether profile completion blocks all other actions until a valid display name exists; whether profile is `GET /me` versus `/users/me`; how deleted accounts appear in retained buyer references; and which closure-restricted operations remain available to merchant after sales stop. Avoid claiming UI presentation in Phase 1. [ASSUMED] Endpoint/path choices and profile-completion UX are not locked in source requirements.

## Project Constraints (from AGENTS.md)

- Use relevant project docs as context; project documents may be stale. If they disagree, conflict with verified behavior, or leave a consequential choice unclear, ask the owner and record resolution in affected documents. [CITED: AGENTS.md]
- Inspect narrowly; avoid dumping lockfiles/generated/dependency/build output. Keep tool/agent usage economical. [CITED: AGENTS.md]
- Use `.planning/PROJECT.md` and `master-document.md` for project context, but they are references rather than automatic precedence rules; ask owner on disagreement. [CITED: AGENTS.md]
- Verify time-sensitive stack versions against current sources before use; follow existing implementation over unmapped architecture where code appears. [CITED: AGENTS.md]
- No project skills were found under `.claude/skills/` or `.agents/skills/`; no additional skill-specific directives apply. [VERIFIED: directory search]
- File editing should be through an initiated GSD workflow; this research file is being written as the explicitly spawned phase researcher deliverable. [CITED: AGENTS.md; task instruction]

### Applicable Coding Conventions

- TypeScript strict; no `any` in app code; use `unknown` at trust boundaries and narrow; discriminated unions for lifecycle states. [CITED: CODING_CONVENTIONS.md]
- Thin Nest controllers, business rules in services, persistence in data-access layer; module boundaries and no generic BaseRepository/BaseService. [CITED: CODING_CONVENTIONS.md]
- Validate all HTTP body/query/params; reject unknown fields; authorization/ownership enforced in service/query; standard 400/401/403/404/409/5xx shape; no stack/SQL/provider leaks. [CITED: CODING_CONVENTIONS.md]
- Migrations only, no schema auto-sync; shared migrations immutable; use DB constraints; multi-row invariants use transactions. [CITED: CODING_CONVENTIONS.md]
- Pino fields stable (e.g. `requestId`, `userId`, `orderId`, `outcome`); never log secrets/tokens/private request bodies; health reflects actual dependency state. [CITED: CODING_CONVENTIONS.md]
- Use approved toolchain, avoid overlapping tooling, and do not add paid/account/telemetry dependencies without owner approval. [CITED: CODING_CONVENTIONS.md; .planning/research/STACK.md]

### Applicable Testing Conventions

- Unit tests for pure policy/normalization; real-Postgres integration for SQL constraints, upsert races and transactions; API tests for validation/authz/status/error shape. [CITED: TESTING_CONVENTIONS.md]
- Tests isolated, order/parallel safe; no sleeps or dependency on demo seed; migrations must apply on empty DB. [CITED: TESTING_CONVENTIONS.md]
- Never report unrun tests passing; implement tests during backend work, with browser journeys in later Phase 7. [CITED: TESTING_CONVENTIONS.md; ROADMAP.md]

## Security Domain

Security enforcement is enabled by default (`security_enforcement` is absent from `.planning/config.json`); include server-side security checks. [VERIFIED: .planning/config.json]

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | Yes | Clerk-issued session token validation via official SDK; do not implement password auth; account/profile/admin-bootstrap tests. [CITED: https://owasp.org/www-project-application-security-verification-standard/; D-01/D-04] |
| V3 Session Management | Yes | Clerk session lifecycle, token expiration, allowed-party/origin check, no custom app refresh token/session; signout behavioral test. [CITED: https://clerk.com/docs/reference/backend/verify-token; D-01] |
| V4 Access Control | Yes | Local application capabilities and per-resource ownership checks, deny-by-default API tests, do not trust front-end/Clerk metadata roles. [CITED: https://owasp.org/www-project-application-security-verification-standard/; D-05/D-06] |
| V5 Input Validation | Yes | One Nest DTO/schema validation strategy; transform/whitelist and reject unknown fields across body/query/params. [CITED: https://docs.nestjs.com/techniques/validation; CODING_CONVENTIONS.md] |
| V6 Cryptography | Yes | Never hand-roll JWT crypto; Clerk SDK verifies signature. Secrets stored only in env/CI secret store, not logs/source; no application password storage. [CITED: https://clerk.com/docs/reference/backend/verify-token; D-01] |
| V7 Error Handling and Logging (ASVS 5 category) | Yes | Structured safe logs, no secrets/PII dumps; no SQL or stack detail in API error responses. [CITED: OWASP ASVS V16; CODING_CONVENTIONS.md] |

### Known Threat Patterns for NestJS + Clerk + PostgreSQL

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Forged, expired, wrong-origin or misrouted bearer token | Spoofing | Clerk signature/time verification; allowlist `authorizedParties`; expected issuer/audience if configured; negative token tests. [CITED: Clerk verifyToken docs] |
| Broken object-level authorization / IDOR | Elevation of privilege | Owner predicate in every query/mutation; cross-tenant fixtures; non-disclosing 404 as convention. [CITED: D-06; CODING_CONVENTIONS.md] |
| Forged body role, userId, ownerId or admin bool | Tampering/Elevation | DTO forbids client-controlled identity/capability fields; identity sourced from verified subject/local DB only. [CITED: D-04..D-06; Nest validation docs] |
| Concurrent duplicate local identities | Tampering/DoS | Unique DB constraint on Clerk subject + upsert/conflict handling; race integration test. [CITED: D-02; Prisma CRUD docs] |
| Secret/token leakage through request logging/errors | Information disclosure | Pino redaction/allowlist; never log auth headers/cookies/body; sanitized exception filter; test logger config if practical. [CITED: CODING_CONVENTIONS.md] |
| Account deletion loses order integrity or user returns after anonymization | Tampering/Repudiation | Preserve local stable id and order references; deactivate external subject resolution; transactional anonymization; test retained references and post-delete access denial. [CITED: D-07; GSD_WORKFLOW.md] |
| Malicious unknown DTO fields silently accepted | Tampering | Global validation with whitelist + forbid unknown properties on every API path. [CITED: CODING_CONVENTIONS.md; Nest validation docs] |

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | API/toolchain | ✓ | v24.22.2 | — |
| npm | Registry/package scripts | ✓ | 12.2.2 | pnpm for project package management |
| pnpm | Workspace manager | ✓ | 11.5.2 (`pnpm --version` on 2026-11-16); Corepack shim at `~/.nvm/versions/node/v24.22.2/bin/pnpm` | Pin `packageManager` to this exact version; Corepack provisions it from the manifest field |
| Corepack | Package-manager provisioning | ✓ | 0.36.0 (`corepack --version` on 2026-11-16) | Used to materialise the pinned `pnpm` version from `packageManager`; never a floating pnpm range |
| Docker Engine | Local environment | ✓ | 29.9.3; `docker info` responds | None identified for Compose requirement |
| Docker Compose | Local environment | ✓ | v2.36.0-desktop.1 | — |
| Vite+ `vp` | lint/test/task orchestration | ✗ | — | Install approved project CLI following official setup; until then use framework-native build/test commands only, not alternate overlapping toolchain |
| PostgreSQL service | API local integration tests | Not running/probed; no app scaffold | — | Compose PostgreSQL service is planned; cannot run test DB yet |
| Clerk dev instance/keys | Real Clerk-session verification and browser signup | Not checked / credentials not available in repository context | — | Unit/API tests can inject test verifier or use test Clerk instance; must not commit credentials |
| GitHub Actions | CI pipeline | Repository remote/account access not verified | — | Local CI commands; owner must enable repository Actions if unavailable |

`docker info` succeeded; `docker compose version` succeeded. `vp` is missing. No app package/test config/test files exist (the repo is currently planning/project documentation only), so no phase test command can be executed yet. [VERIFIED: shell probes; 01-CONTEXT.md]

**Package-manager version (verified 2026-11-16):** `pnpm --version` returns **11.5.2** and `corepack --version` returns **0.36.0**; the `pnpm` on `PATH` is the Corepack shim. `.planning/research/STACK.md` mentions "pnpm 12 workspaces", but that is research-level prose, not an owner-locked version: `.planning/PROJECT.md` locks only "pnpm workspaces + Corepack `packageManager` field" with no version. Phase 1 therefore pins the verified `pnpm@11.5.2` and records the discrepancy in `DEPENDENCIES.md`. If the owner later requires a different pnpm major, that is an owner change and must be escalated, not silently adopted at execution time. [VERIFIED: `pnpm --version`, `corepack --version`]

**Missing dependencies with no fallback:** none blocking basic repository planning.  
**Missing dependencies with fallback:** Vite+ install is needed for intended unified toolchain; Clerk keys/test environment needed for real-token verification; PostgreSQL becomes available through Compose after scaffold.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 5.1.0 (registry current; flagged SUS by slopcheck and needs human-verify install checkpoint); Supertest 7.3.2 for HTTP API tests |
| Config file | None — repository has no application scaffold or test config; Wave 0 creates it |
| Quick run command | Package test script to be defined after Vite+ workspace scaffold; not safe to invent before it exists |
| Full suite command | CI root test task to be defined by Vite+ workspace scaffold; include real-Postgres API/integration suite |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AUTH-01 | Clerk signup config requires email + display name | configuration/contract or manual Clerk-instance smoke | package test task + documented Clerk test-session walkthrough | ❌ Wave 0 |
| AUTH-02 | Valid persistent Clerk session works; expired/invalid token rejected | API integration | API package test task targeting auth guard/Supertest | ❌ Wave 0 |
| AUTH-03 | Browser sign-out removes browser-held session; a request without a token is 401. A copied signed bearer token may still verify until expiry unless the API checks online session state or denies local tombstone. | Frontend/API integration later; Phase1 records contract | no runnable command yet; test missing token and document Clerk test-session fixture | ❌ Wave 0/manual Clerk setup |
| AUTH-04 | First valid request provisions exactly one local user; repeated/parallel request updates one row | API + real DB integration | API package test task against identity integration suite | ❌ Wave 0 |
| AUTH-05 | Verified allowlisted email grants admin only on first create; unverified/mismatch doesn't; returning email change doesn't grant/revoke | Unit + API/DB integration | API package test task against role matrix | ❌ Wave 0 |
| AUTH-06 | Deletion anonymizes personal fields and keeps order buyer reference; deleted subject cannot authenticate/re-provision | API + real DB integration | API package test task against lifecycle suite | ❌ Wave 0; active-merchant policy needs owner answer |
| OPS-01 | Every endpoint validates input and denies unauthenticated/role/owner failures | API integration (real app) | API package test task with Supertest | ❌ Wave 0 |
| OPS-03 | health reflects DB unavailable/available; each request has structured request log without auth secrets | integration + manual log inspection | API package test task; local compose smoke | ❌ Wave 0 |
| OPS-05 | Fresh checkout Compose boot + health; GitHub push runs lint/typecheck/tests; migrations apply on empty DB | CI/DB integration | compose smoke + CI workflow | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** targeted unit/API test command configured in package script (<30s where possible).
- **Per wave merge:** full API unit + real-Postgres integration/API suite.
- **Phase gate:** clean-clone Compose smoke, migration-on-empty DB, complete CI lint/typecheck/test pass before `/gsd-verify-work`. [CITED: TESTING_CONVENTIONS.md; ROADMAP.md]

### Wave 0 Gaps

- [ ] Establish workspace/package manifests and Vite+ setup (tool `vp` is unavailable in current environment; package install requires human checkpoint for `vitest`).
- [ ] Create Vitest config, API test setup and Supertest app bootstrap.
- [ ] Create PostgreSQL integration test harness; ensure migrations are applied to an empty database and suite does not use demo seed.
- [ ] Create test Clerk token/claims strategy and Clerk test-instance smoke instructions, without committed secrets.
- [ ] Add tests for guard fail-closed behavior, user upsert conflict, admin first-create semantics, account deletion references and ownership/role denials.
- [ ] Add GitHub Actions workflow and Compose startup/health smoke command after scripts exist.

## Open Questions

> **Accounting status (2026-11-16, planner revision):** every question below is explicitly accounted for — **4 resolved by a named plan** and **4 escalated to the blocking owner gate in Plan 01-03**. The section is therefore **not marked resolved**: the escalated items remain open until the owner answers them, and Plans 01-04 and 01-08 depend on that recorded answer. Re-check this table when Plan 01-03 completes and record the owner's choice next to each escalated item.

1. **Verified email source / freshness:** Should API use signed custom session claims (`primary_email_address`, `full_name`, `email_verified`) or fetch Clerk Backend User each request? Custom claims are faster but token claims can lag profile changes until refresh; Backend API returns primary email verification status but adds network dependency/rate limits. Recommendation: custom claims for API-local provisioning after verify that the Clerk instance's `email_verified` semantics meet the admin bootstrap requirement; if not, use backend lookup on initial provisioning/admin check only. [CITED: Clerk docs above]
   - **Status: RESOLVED BY PLAN — 01-06 (Task 1 verifier + Task 3 provisioning) and 01-07 (Clerk dashboard session-claim configuration).** The API consumes signed custom claims only and never calls the Clerk Backend API per request; the owner configures the claim names/types in the Clerk dashboard (Plan 01-07 `user_setup`). Assumption A6 (claim semantics == primary-email verification) remains a live-instance configuration check recorded in `01-VALIDATION.md` under manual-only verifications, not an automated claim.
2. **Clerk sign-out/deletion revocation boundary:** Networkless signature verification does not itself prove a Clerk session is still active. Decide acceptable exposure window for an already-issued/copied bearer token after signout/deletion; avoid adding an application refresh-token system. Options include relying on Clerk's short-lived token expiry for normal UI sign-out, checking live Clerk session state on sensitive operations/deletion, or a local deleted-subject tombstone that denies requests after anonymization. [CITED: https://clerk.com/docs/reference/backend/verify-token; https://clerk.com/docs/guides/sessions/session-tokens; [ASSUMED] acceptable window/options]
   - **Status: ESCALATED TO OWNER GATE — Plan 01-03 Task 2 (`checkpoint:decision`, blocking).** The owner selects the tombstone form/retention and the provider-revocation sequence; Plans 01-06 and 01-08 implement exactly that recorded choice and fail closed.
3. **Account deletion while user owns a store or has outstanding order/payment obligations:** D-07..D-09 define preservation outcomes but do not state whether customer deletion can proceed while merchant closure obligations remain, which actor can perform restricted merchant actions after deletion, or whether closure request can be withdrawn. Escalate to owner; technical design must not remove required merchant capability or invent policy. [CITED: CONTEXT D-07..D-09]
   - **Status: ESCALATED TO OWNER GATE — Plan 01-03 Task 1 (`checkpoint:decision`, blocking).** The owner states the eligibility rule, state names, authority to request/reopen closure, and the anonymization trigger; Plans 01-04 and 01-08 encode that answer.
4. **Retention/anonymization policy:** Which fields are personal data, what anonymization is acceptable, whether audit/order/store identifiers or an opaque Clerk-subject tombstone are retained, retention period, legal exceptions, and any erasure hold are undecided. No jurisdiction or legal source is specified. Do not invent duration; owner/legal input required before implementing irreversible deletion/anonymization. [CITED: D-07..D-09; GSD_WORKFLOW.md]
   - **Status: ESCALATED TO OWNER GATE — Plan 01-03 Task 2 (`checkpoint:decision`, blocking), with the retention/erasure-hold answer recorded in `.planning/PROJECT.md` by Plan 01-03 Task 3.** No legal duration is invented anywhere in the plan set.
5. **Merchant closure states/permissions:** Owner requires staged closure but exact state names, whether closure stops all products atomically, policy for pending/unpaid orders, outstanding refunds and who authorizes closure/reopen remain unresolved. Recommend planner adds a decision checkpoint before implementing closure behavior, with a provisional state chart kept out of production until resolved. [CITED: D-08/D-09]
   - **Status: ESCALATED TO OWNER GATE — Plan 01-03 Task 1 (`checkpoint:decision`, blocking).** Plan 01-04 encodes only the accepted state values; Plan 01-08 implements the accepted transitions. No provisional state chart ships.
6. **ORM recommendation:** evidence recommends Prisma, but D-10 keeps final choice open. Planning can use Prisma-shaped tasks per D-11 default unless owner or planner selects MikroORM with reasons; lock the choice before schema scaffold/install. [CITED: D-10/D-11]
   - **Status: RESOLVED BY PLAN — 01-04 Task 1.** The bounded D-11 comparison (PostgreSQL migrations, NestJS integration, transactions/conditional updates, pooling, maintenance stability) found no project-critical MikroORM advantage, so Prisma exactly 7.10.1 (CLI + client + `@prisma/adapter-pg`) is locked; no MikroORM package is installed.
7. **Display-name form/claim:** Clerk requirements say a required display name; Clerk's full name is composed from first/last-name fields and can be null. Confirm whether display name means Clerk username, a single custom name field, or required full name, and make token claim mapping deterministic. [CITED: AUTH-01; https://clerk.com/docs/reference/backend/types/backend-user; [ASSUMED] product interpretation]
   - **Status: RESOLVED BY PLAN — 01-06 Task 1 (typed claim extraction) and 01-07 Task 3 (Clerk configuration contract).** D-02/AUTH-01 fix the product meaning: one required, non-unique display name captured at signup as a single custom Clerk field, mapped deterministically to one signed custom claim; the verifier fails closed when the claim is absent or empty, and the local copy is nullable only because account deletion anonymizes it.
8. **API paths and profile completion:** `/me`, `/users/me`, deletion endpoint response, and whether profile-completion state blocks checkout or merely requires non-null display name are not locked. Document endpoint contracts in plan, not assumed product constraints. [ASSUMED]
   - **Status: RESOLVED BY PLAN — 01-07 Task 2 (`GET /users/me`, OpenAPI baseline in the single `apps/api/src/openapi.ts` assembler) and 01-08 Task 2 (`DELETE /users/me` with documented 204/202/409 outcomes).** Phase 1 defines only a non-null display name for an authenticated, non-anonymized account; checkout-blocking profile completion is not a Phase 1 concern and no checkout rule is invented.


## Sources

### Primary (HIGH confidence)

- Project locked context: `.planning/phases/01-platform-foundation-identity/01-CONTEXT.md` — D-01..D-11 and scope. [CITED: repository file]
- `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md`, `.planning/STATE.md`, `.planning/research/STACK.md`, `.planning/research/ARCHITECTURE.md` — phase traceability, success criteria, stack context, architecture. [CITED: repository files]
- `AGENTS.md`, `CODING_CONVENTIONS.md`, `TESTING_CONVENTIONS.md`, `GSD_WORKFLOW.md` — project constraints/testing/decision authority. [CITED: repository files]
- Clerk `verifyToken`, manual verification, token claims, session customization/JWT templates, Backend User/EmailAddress, deleteUser: https://clerk.com/docs/reference/backend/verify-token ; https://clerk.com/docs/guides/sessions/manual-jwt-verification ; https://clerk.com/docs/guides/sessions/session-tokens ; https://clerk.com/docs/guides/sessions/customize-session-tokens ; https://clerk.com/docs/guides/sessions/jwt-templates ; https://clerk.com/docs/reference/backend/types/backend-user ; https://clerk.com/docs/reference/backend/types/backend-email-address ; https://clerk.com/docs/reference/backend/user/delete-user
- Nest official guards, validation, Prisma and MikroORM integrations: https://docs.nestjs.com/guards ; https://docs.nestjs.com/techniques/validation ; https://docs.nestjs.com/data/prisma ; https://docs.nestjs.com/data/mikroorm
- Prisma v7 migration workflow, transaction/CRUD behavior, pg driver pool, pooled/direct URL and adapters: https://www.prisma.io/docs/orm/v7/prisma-migrate/workflows/development-and-production ; https://www.prisma.io/docs/orm/v7/prisma-client/queries/transactions ; https://www.prisma.io/docs/orm/v7/prisma-client/queries/crud ; https://www.prisma.io/docs/orm/v7/prisma-client/setup-and-configuration/databases-connections/connection-pool ; https://www.prisma.io/docs/orm/v7/prisma-client/setup-and-configuration/databases-connections/pgbouncer ; https://www.prisma.io/docs/orm/v7/core-concepts/supported-databases/postgresql ; https://www.prisma.io/docs/orm/v7/core-concepts/supported-databases/database-drivers
- MikroORM current Nest, migration, transaction, identity map, QueryBuilder, EntityManager/configuration, upgrade, releases and security policy: https://mikro-orm.io/docs/usage-with-nestjs ; https://mikro-orm.io/docs/migrations ; https://mikro-orm.io/docs/transactions ; https://mikro-orm.io/docs/identity-map ; https://mikro-orm.io/docs/query-builder ; https://mikro-orm.io/docs/entity-manager ; https://mikro-orm.io/docs/configuration ; https://mikro-orm.io/docs/upgrading-v6-to-v7 ; https://github.com/mikro-orm/mikro-orm/releases ; https://github.com/mikro-orm/nestjs/releases ; https://github.com/mikro-orm/mikro-orm/security/policy
- Neon official pooled connection constraints and Prisma integration: https://neon.com/docs/connect/connection-pooling ; https://neon.com/docs/guides/prisma
- OWASP ASVS: https://owasp.org/www-project-application-security-verification-standard/
- Npm registry commands run 2026-11-16 for versions, package repositories and postinstall field checks; slopcheck 0.6.1 used for package legitimacy. [VERIFIED: npm registry]

### Secondary (MEDIUM confidence)

- GitHub release metadata for exact Prisma 7.10.1 and MikroORM 7.2.10 publication/release context: https://github.com/prisma/orm/releases/tag/7.10.1 ; https://github.com/mikro-orm/mikro-orm/releases/tag/v7.2.10
- Nest/Pino adapter project: https://github.com/iamolegga/nestjs-pino (registry current version verified; package compatibility with final Nest 12 dependency set should be checked during install).

### Tertiary (LOW confidence / validation pending)

- Whether Clerk `user.email_verified` custom shortcode exactly means the primary address is verified for this app's signup configuration; verify with configured Clerk instance/test sessions and owner decision before enabling admin bootstrap. [ASSUMED]
- Exact account deletion and merchant closure retention/legal rules; no jurisdiction/authoritative policy was provided. Do not treat as a technical default. [ASSUMED]

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH for versions and official APIs checked today; MEDIUM for Prisma final choice because ORM decision remains user-discretion and MikroORM viable.
- Architecture: HIGH for responsibility boundaries and verified Clerk token behavior; MEDIUM for final API paths and claim/profile model.
- Pitfalls: HIGH for upstream token, migration/pool, validation and transactional behavior; MEDIUM for lifecycle/legal handling pending owner decision.

**Research date:** 2026-11-16  
**Valid until:** 2026-12-16 for stable architecture; re-verify fast-moving package versions and Clerk/Prisma/MikroORM APIs at implementation start.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Local Postgres should pin `postgres:17-alpine` consistent with STACK.md | Standard Stack | Image may move or be incompatible; pin exact minor/digest during plan. |
| A2 | Pino integration package is compatible with the final NestJS 12 dependency set | Standard Stack | Peer mismatch or incompatibility; validate during dependency install/build. |
| A3 | Use a conservative `pg` pool max of 5 as an example starting value | Code Examples | Too small/large; treat as initial implementation setting, not performance target. |
| A4 | Merchant identity is most safely derived from owned active store rather than a standalone merchant enum | Journey modeling/ORM | May constrain multiple stores or closure semantics; aligns architecture proposal but needs confirmation in schema plan. |
| A5 | Deletion provider orchestration should locally disable external identity before/alongside Clerk deletion | Architecture Pattern 4 | Wrong sequencing can either permit re-provisioning or leave Clerk account active; owner/security review needed. |
| A6 | The Clerk email-verified shortcode indicates suitable verified status for primary email in this signup flow | Open Questions/Sources | Unverified address could receive admin capability; validate against Clerk tenant API/session tests before trust. |
| A7 | `/me` and `DELETE /me` are suitable starter endpoint paths | Journeys/Open Questions | API contract mismatch with later frontend expectations; confirm in OpenAPI planning. |
| A8 | Active merchant account deletion can be staged alongside closure model without a separate business policy | Open Questions | Could permit unwanted restricted access or erase-required conflicts; owner decision required. |

Claims marked `[ASSUMED]` are not settled project requirements. Do not promote A1–A8 to locked policy without verifying or getting owner confirmation.
