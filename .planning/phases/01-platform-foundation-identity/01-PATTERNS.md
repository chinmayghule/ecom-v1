# Phase 1: Platform Foundation & Identity - Pattern Map

**Mapped:** 2026-11-16  
**Files analyzed:** 22 proposed implementation/configuration/test files (paths are provisional)  
**Analogs found:** 0 / 22 existing implementation files

> **Greenfield warning:** This repository contains planning and convention documents only; it has no application scaffold, source files, manifests, migrations, tests, Compose setup, or CI workflow to copy. The paths below are candidate files inferred from `01-CONTEXT.md`, `01-RESEARCH.md`, and the Phase 1 roadmap, not established project conventions. The planner should settle exact package layout and ORM before implementation. Do not treat research snippets as existing codebase analogs.

## File Classification

| New/Modified File (proposed) | Role | Data Flow | Closest Analog | Match Quality |
|-------------------------------|------|-----------|----------------|---------------|
| `package.json` | config | build/toolchain | None | none |
| `pnpm-workspace.yaml` | config | build/toolchain | None | none |
| `.nvmrc` | config | build/toolchain | None | none |
| `apps/api/package.json` | config | build/toolchain | None | none |
| `apps/api/Dockerfile` | config | request-response/runtime | None | none |
| `docker-compose.yml` | config | request-response/runtime orchestration | None | none |
| `.github/workflows/ci.yml` | config | batch | None | none |
| `apps/api/src/main.ts` | config/bootstrap | request-response | None | none |
| `apps/api/src/app.module.ts` | provider/module | request-response | None | none |
| `apps/api/src/common/config/*` | config | transform/startup validation | None | none |
| `apps/api/src/common/database/prisma.service.ts` (if Prisma chosen) | service/provider | CRUD + transaction | None | none |
| `apps/api/prisma/schema.prisma` and versioned migration(s) (if Prisma chosen) | model/migration | CRUD + transaction | None | none |
| `apps/api/src/common/auth/clerk-auth.guard.ts` | middleware/guard | request-response | None | none |
| `apps/api/src/common/authorization/*` | middleware/guard/utility | request-response | None | none |
| `apps/api/src/common/validation/*` | middleware/config | request-response | None | none |
| `apps/api/src/common/errors/*` | utility/filter | request-response | None | none |
| `apps/api/src/identity/identity.module.ts` | provider/module | request-response | None | none |
| `apps/api/src/identity/identity.service.ts` | service | CRUD + transaction | None | none |
| `apps/api/src/identity/identity.controller.ts` and DTO(s) | controller/validation | request-response | None | none |
| `apps/api/src/health/*` | controller/service | request-response + health probe | None | none |
| `apps/api/src/**/*.spec.ts` and API/integration harness | test | request-response + CRUD/transaction | None | none |
| `apps/api/test/*` (if separate API-level test layout is selected) | test | request-response | None | none |

The research's suggested Nest layout (`apps/api/src/main.ts`, `app.module.ts`, `common/`, `identity/`, `health/`, `test/`) is guidance, not a pattern discovered in source. Do not add UI implementation in this phase: Clerk-hosted identity flows are exercised/contracted here, while the web app is a later phase.

## Pattern Assignments

### Proposed API bootstrap and global middleware files

**Files:** `apps/api/src/main.ts`, `apps/api/src/app.module.ts`, `apps/api/src/common/config/*`, `apps/api/src/common/validation/*`, `apps/api/src/common/errors/*`

**Analog:** None in the repository. Use NestJS framework conventions and the approved project conventions below; keep exact module and package names provisional until scaffolded.

**Imports / bootstrap / validation convention** (source: `01-RESEARCH.md` lines 373-385; external Nest example, not existing project code):
```typescript
app.useGlobalPipes(new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
  forbidUnknownValues: true,
}));
```

The global validation boundary should cover body, query, and path parameters; reject unrecognized fields. Project convention is one DTO/schema style for the API. Research recommends Nest DTOs with `class-validator`/`class-transformer`, but versions and final scaffold must be checked before implementation. Keep global error translation consistent with `CODING_CONVENTIONS.md` lines 63-79: malformed input 400, unauthenticated 401, forbidden 403, absent/not-visible 404, conflicts 409, and sanitized 5xx; do not expose SQL, provider details, or stack traces.

**Configuration:** Validate required secrets, DB URLs, admin allowlist, and web origins at startup; fail fast. No existing env schema or config loader exists. Secret values belong in local environment/CI secrets, never source or logs.

### Proposed Prisma provider and schema/migration files

**Files:** `apps/api/src/common/database/prisma.service.ts`, `apps/api/prisma/schema.prisma`, versioned migration(s), and ORM configuration (exact names depend on selected Prisma version).

**Analog:** None in the repository. The ORM is explicitly not locked by D-10; the research recommends Prisma 7.10.1 provisionally, but planner must record the final bounded-comparison decision before generating schema or installing dependencies. If Prisma is selected, use the matching pinned CLI/client/adapter versions and confirm the current Prisma 7 config filename.

**Provider pattern** (source: `01-RESEARCH.md` lines 338-354; conceptual external Nest/Prisma example, not a codebase analog):
```typescript
const adapter = new PrismaPg({
  connectionString: config.getOrThrow<string>('DATABASE_URL'),
  max: 5,
  connectionTimeoutMillis: 5_000,
  idleTimeoutMillis: 10_000,
});
super({ adapter });
```

Treat the pool size as a starting example, not a measured target. In the Prisma 7 research setup, runtime driver-adapter configuration uses the application URL; CLI migrations use a separate direct URL when pooling is present. Use versioned reviewed migrations, never schema auto-sync or `db push` for shared schema, and encode invariants with database constraints. Multi-row identity deletion/anonymization changes must be transactional. `CODING_CONVENTIONS.md` lines 104-117 and `TESTING_CONVENTIONS.md` lines 71-78 are the applicable project patterns for migrations.

**Schema/domain constraints to preserve:** unique immutable Clerk subject; roles/capabilities are not a mutually exclusive account-type enum; retain stable local identity/order buyer references during anonymization; do not cascade-delete business/order records. Any subject tombstone and deletion-provider sequencing remain privacy/security decisions requiring resolution, not an analog-derived default.

### Proposed Clerk guard and local identity provisioning files

**Files:** `apps/api/src/common/auth/clerk-auth.guard.ts`, `apps/api/src/identity/identity.service.ts`, `identity.module.ts`, and request user/capability helpers.

**Analog:** None in the repository. Use Nest's guard/DI conventions plus Clerk's official backend SDK (`@clerk/backend`), not custom JWT verification or an assumed Clerk Nest SDK. No webhook provisioning, passwords, app-issued JWTs, or refresh-token system.

**Core request pattern** (source: `01-RESEARCH.md` lines 216-241; shape-only external Clerk example):
```typescript
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
request.user = user; // application roles come only from local DB
```

Verify token signature/time/origin through Clerk SDK; use an explicit origin allowlist and bearer transport for browser-to-API requests unless cookie support is intentionally designed. Default Clerk session claims do not include profile email/name: require configured and typed claims (including verified status) or make a deliberate Backend API lookup. Missing/invalid identity claims should fail closed with a documented profile-completion outcome where applicable. Never log authorization headers, cookies, session tokens, or secrets.

**Provisioning/authorization behavior:** Resolve by unique Clerk `sub` using an atomic upsert/conflict-safe operation. Refresh local profile copies from verified identity; add admin capability only in the first-create branch when a normalized verified email matches normalized `ADMIN_EMAILS`. Later email/profile refreshes must neither grant nor revoke admin. Attach local user/capabilities to request context; derive authorization from local state, not Clerk metadata or client-supplied fields. For data access, owner constraints belong in the service/query, not just the controller/guard.

### Proposed identity controller and account lifecycle service

**Files:** `apps/api/src/identity/identity.controller.ts`, DTO(s), and `identity.service.ts` (possibly a separate lifecycle service only if needed).

**Analog:** None in the repository. Keep controllers thin per `CODING_CONVENTIONS.md` lines 48-60; put lifecycle rules and persistence in the service/data-access boundary. The likely `/me` and `DELETE /me` routes are research suggestions, not locked API paths (see `01-RESEARCH.md` lines 412-422 and open question at 543).

**Deletion pattern:** Perform local anonymization and relevant lifecycle state changes transactionally while retaining the stable internal user ID and order references. Do not cascade-delete. Ensure an anonymized/deleted subject cannot be automatically re-provisioned by a still-valid signed Clerk token; the research raises an opaque tombstone or equivalent permanent deny strategy, but classification/retention of that mapping is an unresolved owner/privacy decision. Coordinate Clerk account/session deletion without allowing a provider/network failure to silently restore access or undo committed local anonymization. Do not invent retention periods or merchant-obligation rules. The exact behavior for users who own a store or have outstanding orders/refunds requires owner resolution before irreversible deletion semantics are implemented.

### Proposed health, logging, and operational configuration

**Files:** `apps/api/src/health/*`, Pino setup (likely in API bootstrap/common), Compose API/database definitions, and CI workflow.

**Analog:** None in the repository. Use Nest/Pino integration after verifying compatibility with the chosen Nest version. Health readiness must probe PostgreSQL; liveness/readiness should not be conflated if they have different dependency semantics.

**Logging excerpt** (source: `01-RESEARCH.md` lines 387-394; convention example, not existing code):
```typescript
logger.info({ requestId, userId, action: 'identity.provisioned' }, 'identity resolved');
// Never log Authorization, __session, Clerk secret/JWT key, raw request body,
// private profile fields, or payment/card data.
```

Use stable structured field names (`requestId`, `userId`, `outcome`); redact or omit tokens, cookies, secrets, and sensitive request data. Compose startup should use healthchecks/readiness dependencies, not shell sleeps. CI should install from the committed lockfile, run the package's configured lint/typecheck/test tasks, and exercise migrations/tests against an empty PostgreSQL database. Script names do not exist yet and should not be invented in the plan.

### Proposed test files and harness

**Files:** colocated `*.spec.ts` tests and/or an API/integration test directory, plus test configuration and DB fixture setup.

**Analog:** None in the repository. `TESTING_CONVENTIONS.md` is the project test standard, not an implementation example. Use the actual package's established location after scaffold; do not assume a test command before Vite+/workspace scripts exist.

Tests should include:
- Unit tests for pure claim normalization, allowlist matching, and capability policy.
- Real-PostgreSQL integration tests for unique Clerk-subject provisioning/upsert races, constraints, transactions, anonymization/order-reference preservation, and migration-on-empty-DB.
- API/Supertest tests through the Nest app for absent/invalid token, invalid/missing claims, validation rejection, customer/admin capability matrix, ownership denial, profile provisioning, first-create-only admin bootstrap, and post-deletion re-provision denial.
- Isolated fixtures; parallel/order-safe execution; no arbitrary sleeps or demo-seed dependency.

Mocks alone cannot prove SQL, transaction, migration, or full HTTP security behavior. Real Clerk credentials are not present in the repository context; tests need a safe test-token/verification seam and a documented manual Clerk-instance smoke where genuine provider behavior is required. Do not commit credentials.

## Shared Patterns

### Trust boundaries and server-side authorization
**Sources:** `CODING_CONVENTIONS.md` lines 63-79; `01-RESEARCH.md` lines 249-253.  
**Apply to:** Every protected endpoint and third-party claim boundary.

- Narrow `unknown` external data; no `any` in application code (`CODING_CONVENTIONS.md` lines 22-34).
- Auth establishes the verified local identity; capability checks gate actions; resource ownership is applied inside the service's database query.
- Reject client-supplied user/role/owner fields and unknown DTO fields. Frontend checks are usability only.
- Use consistent 400/401/403/404/409/5xx responses and never leak internal details.

### Database integrity and lifecycle
**Sources:** `CODING_CONVENTIONS.md` lines 104-117; `TESTING_CONVENTIONS.md` lines 29-37, 71-78.  
**Apply to:** Identity, role/capability persistence, and anonymization.

- Use unique/FK/check constraints for invariants; use transactions for multi-row state changes.
- Migrations are versioned, reviewed, and tested on an empty database; no auto-sync.
- Preserve business/order references when personal profile information is anonymized.
- Escalate unresolved legal retention, tombstone, and merchant-closure policies; do not fill these gaps with guessed behavior.

### Logging and operational visibility
**Source:** `CODING_CONVENTIONS.md` lines 119-129.  
**Apply to:** All API requests, identity operations, health/readiness, and failures.

- Pino structured logs with stable fields and outcome-oriented messages.
- Never log secrets, tokens, full credential-bearing request bodies, or card data.
- Health reports actual dependency state, especially PostgreSQL readiness.

### Testing
**Source:** `TESTING_CONVENTIONS.md` lines 10-20, 48-69, 93-103.  
**Apply to:** Every source/config/schema behavior where it is testable.

- Choose the lowest test level that can observe the behavior; use a real DB for SQL/transaction guarantees and HTTP tests for guards/validation/error contracts.
- Tests arrange/act/assert around one observable behavior and remain isolated/order/parallel safe.
- Report only tests actually run; record phase verification evidence in the verification artifact.

## No Analog Found

All 22 proposed files are new to this greenfield repository. There are **no existing implementation analogs** for Nest modules, auth guards, services/controllers, ORM providers/schema/migrations, health routes, tests, Docker, or CI. The directly applicable sources are project standards (`CODING_CONVENTIONS.md`, `TESTING_CONVENTIONS.md`, `AGENTS.md`) and the framework/project proposals in `01-RESEARCH.md`; those provide constraints and conceptual/external snippets, not code to copy verbatim.

| Area | Reason no analog exists | Use instead |
|------|------------------------|-------------|
| Nest API/bootstrap, guards, identity, health, validation, filters | No application source or scaffold exists | NestJS framework conventions plus the bounded patterns in `01-RESEARCH.md`; adhere to project coding conventions |
| ORM/schema/database service/migrations | No selected/installed ORM or DB schema exists; D-10 leaves ORM open | Record ORM choice before implementation; if Prisma is chosen, follow the pinned Prisma 7 research guidance and project migration conventions |
| Docker Compose and CI | No app manifests, containers, or workflow exist | Docker Compose healthcheck and GitHub Actions conventions cited in research; define scripts during scaffold |
| Tests and fixtures | No test config, source, or fixtures exist | `TESTING_CONVENTIONS.md`; configure the chosen toolchain in the scaffold and exercise PostgreSQL-backed behavior |

## Metadata

**Analog search scope:** Repository-wide source/config glob, project conventions, phase research and roadmap; no implementation directories/files were present.  
**Implementation analogs scanned:** 0 (none exist).  
**Pattern extraction date:** 2026-11-16
