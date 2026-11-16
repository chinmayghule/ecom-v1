# AGENTS.md

Project instructions for OpenCode and GSD agents working on **ecom-v1**.

## Project identity

Portfolio-scale, marketplace-lite e-commerce app: customers, self-service merchants, and a minimum platform-admin capability. Stages 1 (monolith) and 2 (hardened monolith) are mandatory; Stages 3–5 and the AI extension are optional and not prerequisites for completion.

## Sources of truth

Resolve questions in this order:

1. `master-document.md` — approved product requirements, scope, technology direction, constraints, stages. Authoritative.
2. `.planning/` — GSD plans, roadmap, state and verification evidence.
3. The codebase and verified behaviour.
4. Supporting engineering conventions (see "Detailed conventions").

Rules:

- Do not silently override an approved master-document decision. Raise material conflicts with the owner.
- Verified code does not automatically become the requirement: an unapproved deviation is a defect to raise, not a new baseline.
- **Stage ≠ GSD phase.** Stage 1–5 are long-term deliverables; GSD phases are implementation-sized units in `.planning/`. Never conflate or renumber across them.

## Repository state

Deliberately unscaffolded: the repository holds only documentation, this file, `.gitignore` and the Graphify plugin. There are **no apps, packages, manifests, lockfiles, CI or scripts yet**.

- Do not invent commands, directory layouts, package names or build steps. Verify before documenting.
- Do not scaffold or install dependencies unless a plan explicitly calls for it.

## GSD working relationship

GSD is the primary engineering team, not a code generator awaiting instructions. The owner should not have to supervise routine technical work.

Act independently on:

- Conventional, reversible technical decisions.
- Research of unfamiliar technology, using authoritative/current documentation.
- Choosing mature, well-maintained packages over custom implementations.
- Recording assumptions and unresolved decisions.

Do not re-ask what project documentation already answers. Explain material trade-offs.

**Escalate before acting** on:

- Ambiguous product or business rules.
- Security, privacy or data-integrity implications.
- Expensive or hard-to-reverse architectural choices.
- Changes to approved scope or technology decisions.
- Destructive operations or consequential Git/database actions.
- New paid services, subscriptions or spending exposure.

Escalations state the issue, its consequences, the recommended choice and the alternatives. Continue safe independent work meanwhile; record non-blocking issues for later review. Never conceal failing tests or present incomplete work as complete.

## Implementation order

**Backend → Frontend → Integration → Deployment.** No feature-by-feature vertical slices.

- Backend is a coherent, tested subsystem before substantial frontend work starts.
- Backend planning must still model the customer and merchant journeys so API contracts serve their real consumers.
- Frontend builds against established backend contracts and the generated API client — not against speculative endpoints.
- Test each subsystem during its own implementation; end-to-end journey verification comes after both exist.
- Planning both subsystems up front is allowed; executing the frontend early is not.

Phase lifecycle and decision authority: `GSD_WORKFLOW.md`.

## Engineering quality

Require type-safe, secure, maintainable code. Prefer the smallest correct workflow.

Avoid: premature abstraction, speculative scaling, unnecessary or duplicate dependencies, unapproved deviations, and throwaway compatibility projects for mature packages.

Flag security problems, poor practices and significant code smells with their consequences and the better alternative. The `master-document.md` constraints are binding: backend authority for authz, ownership and purchase totals; zero-spend hosting; no real card data in the mock payment path.

Code changes: `CODING_CONVENTIONS.md`. Tests: `TESTING_CONVENTIONS.md`.

## Git and worktrees

- Worktrees isolate concurrent or parallel code-modifying tasks. **Never let two implementation agents modify the same working tree.**
- No worktree for read-only research or ordinary sequential work.
- Never force-push, delete remote branches, or perform destructive/consequential Git operations without owner approval.
- Branch from `main`; it is the only branch and is currently unprotected. No CI exists yet, so nothing enforces these rules but review.
- Consult `GIT_CONVENTIONS.md` and `GIT_WORKFLOW.md` before any commit, branch, merge, or worktree operation.

## Context efficiency

- Inspect narrowly: symbol/reference search, relevant line ranges, focused snippets first.
- Read a whole file when it is small, or when behaviour depends on its full dependencies, invariants or side effects.
- Never dump lockfiles, generated output, dependency directories or build artefacts into the conversation.
- Once Graphify is installed and its graph exists, use scoped Graphify queries for architecture and impact analysis before broad searches. Graph output is navigation, not proof — verify against source.

## Cost and secrets

- Keep agent/model/tool usage economical; avoid redundant parallel runs and repeated research.
- No paid tier, overage or spending exposure without owner approval.
- Never commit, log or report credentials, API keys or tokens.

## Historical reference

`github.com/chinmayghule/ecom-v0` (`AGENTS.md`, `GIT_CONVENTIONS.md`, `GIT_WORKFLOW.md`, `ecom_project_master.md`) is **historical context only**. Learn from its decisions and mistakes, but do not copy its stack or tooling: v0 used pnpm workspaces, Biome, Lefthook, NestJS 11 and TypeORM. ecom-v1 mandates Vite+, NestJS 12, Next.js 16, and its own Git documentation. Apply v0 conventions only where the current master document does not override them.

## Detailed conventions

Read the relevant document before the task, not after:

| Task | Document |
|---|---|
| Commit, branch, merge, worktree | `GIT_CONVENTIONS.md`, `GIT_WORKFLOW.md` |
| Application code, API, schema, logging | `CODING_CONVENTIONS.md` |
| Writing or fixing tests | `TESTING_CONVENTIONS.md` |
| GSD planning, execution, reporting | `GSD_WORKFLOW.md` |

Keep this file concise. Procedures belong in those documents; add a reference here rather than expanding this file.

## graphify

- Skill is installed globally (`~/.config/opencode/skills/graphify/`); invoke `/graphify` to build, with `--no-viz` as the project default.
- Output lives in `graphify-out/`, which is gitignored. If `graphify-out/GRAPH_REPORT.md` exists, read it before architecture questions and prefer `graphify query` / `path` / `explain` over grep for cross-module questions. Verify findings against source.
- Git hooks are local-only (`.git/hooks`, not tracked). On a fresh clone run `graphify hook install`; after code changes run `graphify update .` (AST-only, no LLM cost).
- Do not generate, open or commit `graph.html` — the visual page is not used. Never add `graphify-out/` to git.

<!-- GSD:project-start source:PROJECT.md -->
## Project

**ecom-v1**

A portfolio-scale, marketplace-lite e-commerce application where independent merchants offer products through a shared storefront. Customers discover products, maintain a persistent cart and complete a simulated-purchase journey; merchants self-onboard and run their own store, catalogue, inventory and seller-facing orders; platform administrators perform the minimum central oversight. It exists to demonstrate end-to-end engineering quality — design, build, test, deploy, operate and explain — not to become an enterprise marketplace.

**Core Value:** A customer can discover a merchant's product, buy it through a safe, backend-enforced checkout (authoritative totals, validated inventory, deterministic mock payment with honest unknown-outcome handling), and the resulting order is correctly visible and actionable to the right merchant — with ownership and authorization enforced server-side throughout.

### Constraints

- **Tech stack**: TypeScript; Next.js 16 + React frontend; NestJS 12 backend; PostgreSQL; monorepo with web, API and only justified shared packages — accepted direction, verify versions during research, do not silently override
- **Identity**: Clerk for authentication; no custom passwords, JWT issuance or refresh-token systems; application-owned authorization in the NestJS backend (frontend guards are not a security boundary)
- **API contract**: OpenAPI as source of truth with generated client code where appropriate
- **Toolchain**: Vite+ as unified toolchain (format/lint/test orchestration/git hooks); no overlapping tools without concrete reason; does not replace Next.js/NestJS build systems
- **Testing**: Vitest, Supertest, React Testing Library, Playwright (current preferred directions, verify fit)
- **Hosting**: Frontend on Vercel (provider hostname, no custom domain); backend + hosted PostgreSQL provider not yet selected — must satisfy zero-spend; maintain local/demo fallback
- **Budget**: Zero-spend — no paid subscriptions, domains, unavoidable charges or auto-overages without explicit owner approval; verify provider terms before adoption
- **Observability**: Pino structured logs mandatory; Better Stack only within verified free-tier zero-spend boundary
- **Architecture**: Practical modular monolith first; no microservices, brokers, Kubernetes or extra deployment layers without a justified optional-stage objective
- **Correctness**: Backend authority for authz, ownership and purchase totals; safe failure behaviour (timeout ≠ payment failure); no speculative scale; no silent scope expansion
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

## Recommended Stack
### Core Technologies
| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| TypeScript | 6.0.3 (pin `typescript@6`) | Language across monorepo | Latest stable **6.x**; `@nestjs/swagger` 12 declares `peerDependencies.typescript: "^5.5.0 \|\| ^6.0.0"` and NestJS 12 tooling (`@nestjs/cli`) still consumes the TypeScript **programmatic API**, which TypeScript 7 has not shipped yet (planned for 7.1, stable ~2026-11-24). TS 7.0.2 (Go-native) is stable but API-less — safe for plain `tsc` builds, risky for `nest build`. Revisit TS 7 after 7.1 ships. **MEDIUM-HIGH** |
| Node.js | 24 LTS (≥ 24.x; minimum 22.12) | Runtime | Common floor of every component: NestJS 12 requires Node ≥20.19 or ≥22.12 (for `require(esm)`), Playwright ≥1.65 requires Node 22/24/26, `@hey-api/openapi-ts` requires Node ≥22. Node 24 is the current LTS; manage via Vite+ `vp env`. **HIGH** |
| Next.js | 16.4.6 (`^16.4.6`, do not use canary) | Web frontend | Verified latest stable release (2026-11-09). Turbopack default bundler, React 19.3, Cache Components model. Active security-patch cadence (3 security releases in Q3–Q4 2026 alone) — pin to the 16.4.x line and let patch updates flow. **HIGH** |
| React | 19.3 (via Next.js) | UI runtime | Next.js 16.4 ships React 19.3 (stable View Transitions, Fragment Refs). No direct pin needed. **HIGH** |
| NestJS | ^12.4 (12.0.0 GA 2026-08-27; 12.4.x current, 12.4.2/12.5.0 mid-Nov) | Backend API framework | Verified current major. v12 ships ESM-ready packages (CJS apps keep working via `require(esm)`), first-class **Standard Schema** validation (Zod/Valibot/ArkType in `@Body({ schema })`), built-in cookies/CSRF/security headers (12.1), rebuilt CLI. 11.x entered end-of-active-support 2026-08-27 — do not start a new project there. **HIGH** |
| PostgreSQL | 16/17 (Neon free plan; local Docker `postgres:17-alpine`) | Primary datastore | Required by master doc. Nothing exotic: money as integer paise, integer FKs, unique constraints for ownership — plain PostgreSQL. **HIGH** |
| Clerk (`@clerk/backend` / `@clerk/nextjs`) | backend 3.29.x, nextjs 7.10.x (Core 3) | Identity / authentication | Verified current: `@clerk/backend@3.29.0` (2026-11-14), `@clerk/nextjs@7.9–7.10` (Core 3). Core 3 requires Next.js ≥16.0.10 — satisfied. Hobby plan is free with **50,000 MRU per app, no credit card** (raised from 10k MAU on 2026-02-05; the "10k MAU" figure found in older articles is stale). **HIGH** |
| Better Stack | free "personal projects" plan | Optional hosted observability | Verified terms (below). Uptime monitors are the zero-risk part; logs ingestion needs an ingestion cap. **HIGH** (terms), conditions apply |
### Database Access Layer (ORM decision — master doc leaves this open)
| Consideration | Assessment |
|---|---|
| Fit to this project | Checkout correctness depends on transactions, unique constraints and conditional updates. Prisma gives a schema file (auditable, diffable, agent-friendly), generated fully-typed client, `prisma migrate` with a real migration history, and interactive transactions (`$transaction`) — everything the order/inventory invariants need. |
| Current state | Prisma 7.10.1 (2026-10-19) is the latest stable. Rust query engine is gone (since 7.0): client compiles queries via WASM on the JS thread and connects through a **driver adapter** — install `@prisma/adapter-pg` and pass the `pg.Pool` to `PrismaClient`. |
| ⚠️ Version trap | `npm i prisma` with no tag now installs the **Prisma 8 CLI** (8.0 is RC, 23 RCs as of 2026-11-06; GA slipped past Oct 2026). Prisma 8 CLI does not read `schema.prisma` and has no `migrate dev`. **Pin `"prisma": "7.10.1"` (no `^`) and `"@prisma/client": "7.10.1"`** in package.json and in CI. Prisma 7 receives fixes for 18 months after Prisma 8 GA. |
| Drizzle (alternative) | Stable line is 0.45.x; **1.0 is still RC** (1.0.0-rc.5, 2026-10-21) with breaking changes (RQB v2 replaces v1, `undefined` filters now throw, relational queries cache by default). Wrong time for a greenfield project to absorb an in-flight API migration. Reconsider only if the team strongly prefers SQL-shaped queries. |
| TypeORM (rejected) | Master doc forbids copying v0's stack. Independently: TypeORM 1.0 only landed 2026-05-19 under new maintainers — a 1.0 with ongoing behaviour changes (null/undefined in `where` now throws, INNER JOIN on non-nullable many-to-one) is not the baseline for a correctness-focused greenfield build. |
### Supporting Libraries
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `pino` | 10.4.0 | Structured logging (master-doc mandate) | Always; pair with `nestjs-pino` for request-scoped child loggers, or Nest 12's improved built-in logger wired to a Pino stream. **HIGH** |
| `@nestjs/swagger` | 12.1.1 | OpenAPI generation (source-of-truth pipeline, see below) | Always on the API. Pure ESM, requires Nest 12, supports Nest 12 Standard Schema reflection via `standardSchemaConverter`. **HIGH** |
| `class-validator` + `class-transformer` | 0.15.x / 0.5.x | DTO validation (Nest documented default) | For DTO-driven endpoints. Alternatively use Zod 4 via Nest 12 Standard Schema pipes — either is supported; do not mix both styles in one module. |
| `zod` | 4.6.x | Runtime validation shared with client (optional) | Use as the single validation vocabulary if you want schemas shared into the generated client; `@nestjs/swagger` can convert them into the OpenAPI doc. |
| `@hey-api/openapi-ts` | 0.99.0 (**pin exact**, it is pre-1.0) | Generated typed API client for Next.js | Always for the web app. Generates SDK functions + types (+ optional Zod plugin) from the served `openapi.json`. Node ≥22 required. Used by Vercel/OpenCode/PayPal. |
| `openapi-typescript` 7.13 + `openapi-fetch` 0.17 | — | Lighter alternative client (types only) | Only if the team prefers a ~6 kB fetch wrapper over a generated SDK. Not the default. |
| `passport`/`passport-custom` | — | NOT needed | Clerk auth in Nest is a plain custom guard (below). Adding Passport adds indirection with zero benefit here. |
| `supertest` | 7.3.1 | API integration tests | Always (verified in NestJS 12 ecosystem tooling). |
| `vitest` | 5.x | Unit/component tests | Always; bundled inside Vite+ (`vp test`) and NestJS 12's ESM template default. |
| `playwright` | ^1.65.1 | Browser E2E journeys | Always for customer/merchant journeys; requires Node 22/24/26. |
| `drizzle-orm` | (not selected) | — | See ORM decision above. |
| Docker + Docker Compose | compose v2 | Local Postgres + one-command demo env | Always; also the zero-spend fallback deployment target. |
### Development Tools
| Tool | Purpose | Notes |
|------|---------|-------|
| **Vite+ (`vite-plus`) 1.6.x** | Unified toolchain (master-doc mandate) | Verified: 1.0 stable 2026-09-28, current 1.6.0 (2026-11-11), MIT, by VoidZero (now under Cloudflare). One `vp` CLI + one `vite.config.ts` covers: `vp check` (Oxfmt format + Oxlint lint + type-check), `vp test` (bundled Vitest 5), `vp run` (monorepo task runner with caching), `vp hooks`/`vp staged` (Git hooks — replaces Lefthook/Husky), `vp env` (Node/package-manager management), `vp build`/`vp pack` (Vite 8 + Rolldown). |
| **Vite+ coexistence rule** | Vite+ does **not** replace framework builds | Keep `next build` for the web app and `nest build`/`tsc` for the API. Use Vite+ for repo-level concerns: formatting, linting, type-check orchestration, test running (`vp test` drives Vitest including Nest/Supertest suites), task caching and Git hooks. Do not add ESLint/Prettier/Biome/Lefthook/Husky/turbo alongside it. |
| `setup-vp` GitHub Action | CI installs Vite+ | Collapses Node setup + package-manager + caching into one step. |
| pnpm 12 workspaces | Monorepo package management | Vite+ auto-detects the package manager and supports pnpm 12. (v0 used pnpm workspaces too, but this is a generic ecosystem choice, not a v0-specific artifact.) |
| Graphify | Codebase mapping (master doc) | Per AGENTS.md: install early, AST-only `graphify update .` after changes, output gitignored. |
| Starlight | Engineering documentation site | Per master doc §4 Documentation. |
## Hosting (zero-spend) — backend + hosted PostgreSQL
### Database: **Neon free plan — recommended. Confidence: HIGH (terms verified 2026-11-03 update on neon.com)**
| Term (verified) | Value |
|---|---|
| Price | $0/month, permanent (not a trial), **no credit card required** |
| Storage | 1 GB per project (20 GB total across projects) |
| Compute | 100 CU-hours per project per month, autoscaling up to 2 CU (~8 GB RAM); scale-to-zero after 5 min idle (cannot be disabled — which is *good* for zero-spend) |
| Egress | 5 GB per project per month |
| Overage behaviour | **Suspends compute / blocks growing writes until next cycle — explicitly does not bill overages on Free; no data deleted.** Because no card is on file, charges are physically impossible. |
| Connection pooling | Built-in PgBouncer accepts up to 10,000 client connections |
### Backend compute — candidates
| Term (verified from cloud.google.com/run/pricing + free-tier docs, 2026-11) | Value |
|---|---|
| Free tier | 2M requests/month + 180,000 vCPU-seconds + 360,000 GiB-seconds (request-based billing, Tier-1 price basis), pooled per billing account |
| Fit | A demo marketplace at visitor scale stays well inside the free tier: CPU only bills while a request is open; scale-to-zero; no minimum instances |
| ⚠️ Billing account | A **billing account (payment method) is required**; usage above free tier **auto-bills** — this is the one genuine conflict with "no automatic paid overages" |
| How charges are prevented | (1) request-based billing with **0 minimum instances** so idle cost is exactly $0; (2) set **max instances = 1** so worst-case spend is capped at one small instance; (3) GCP **budget alert** at $1; (4) written owner approval for card-on-file. With those in place the realistic bill is $0; the residual risk is a bug keeping requests hot (mitigated by max instances) |
| Notes | Egress free allowance is only 1 GiB NA — fine for a JSON API; static assets live on Vercel |
| Candidate | Verified state (Oct–Nov 2026) | Verdict |
|---|---|---|
| **Railway** (free plan) | Free plan: $0/mo with **$1 usage credit/month, no rollover**, 1 project / 3 services, 0.5 GB RAM, 1 replica, no card needed. $1 ≈ 100 MB of resident RAM for a month — an always-on NestJS service exhausts it in days and then **stops** (safe but useless). $5 one-time/30-day trial is bigger but a fuse. | Compliant-but-inadequate. Viable only as a short-lived demo window during the trial. Not primary. |
| **Koyeb** | Since 2026-02: card required ($29 hold), new accounts default to **Pro $29/month** (Mistral AI acquisition); free instance exists only inside a paid plan for new signups. | **Excluded** — fails zero-spend for a new account. |
| **Fly.io** | Free allowances ended 2024; trial = 2 machine-hours or 7 days; card required to keep anything running; ~$1.94/mo cheapest machine. | **Excluded** — no free tier. |
| **Render** | Excluded by master doc. | Excluded. |
| **Oracle Cloud Always Free** | 2 ARM OCPUs / 12 GB RAM (halved 2026-06), card for verification, no auto-charge beyond always-free, idle instances reclaimable, capacity availability unreliable. | Legitimate backup: strongest free compute and can also host Postgres, but it is a self-managed VM (patching, reverse proxy, storage sizing) — more ops than a portfolio project needs. Mention as fallback if Cloud Run is rejected. |
| **SnapDeploy free** | No card, 4 containers × 512 MB, **100 container-hours/month**, sleeps after 15 min. | Technically compliant, but a very small vendor — longevity risk for a deployment that should stay reachable. Not primary. |
### Better Stack free tier — terms verified. Confidence: HIGH
- **10 monitors & heartbeats**, 1 status page, Slack + e-mail alerts (free monitors check every ~3 min; 30-second checks are paid)
- **3 GB logs retained for 3 days** (3 GB traces for 3 days; 30 GB metrics — the master-doc claim is confirmed)
- 100,000 exceptions/month, 5,000 session replays (not needed here)
- No credit card required for the free plan
### Observability summary
- **Pino 10.4.0 structured logs — mandatory, local-first** (stdout JSON; `pino-pretty` in dev only).
- Better Stack: uptime monitors yes; log forwarding yes only with the Vector cap above; never with a card on file.
## Installation
# Monorepo root (Vite+ manages Node/pnpm)
# apps/api (NestJS 12)
# apps/web (Next.js 16)
# Repo root dev tooling is Vite+ itself (vite-plus) — do NOT also install
# eslint, prettier, biome, lefthook, husky, or turbo.
## Alternatives Considered
| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Prisma 7.10.x | Drizzle ORM (1.0.0-rc.5) | Only if the owner prefers SQL-native queries over a schema DSL; wait for Drizzle 1.0 GA to avoid RC churn |
| Prisma 7.10.x | TypeORM 1.1.x | Only when inheriting a NestJS+TypeORM codebase; explicitly not here (master doc) |
| @nestjs/swagger (code-first OpenAPI) | Design-first (OpenAPI file → nest-openapi/spec validators) | Never for this project: it duplicates DTO/validation and drifts from the code; NestJS is decorator-first |
| @hey-api/openapi-ts 0.99 (SDK + types) | openapi-typescript 7.13 + openapi-fetch 0.17 (types-only) | If generated-SDK size/maintenance is a concern; loses named per-operation functions and Zod plugin |
| Cloud Run (backend) | Oracle Cloud Always Free VM | If owner rejects card-on-file entirely; cost is ops complexity instead of money |
| Neon free (DB) | Local Docker Postgres only | If no external DB is acceptable — but then "deployed app with persistent data" fails the Stage 1 evidence bar |
| Better Stack (uptime + capped logs) | Local-only Pino + no monitors | If a zero-spend cap cannot be verified after signup (master doc pre-authorises this fallback) |
| Express platform (`@nestjs/platform-express`) | Fastify (`@nestjs/platform-fastify`) or new native `platform-node` (Nest 12.3+) | Express is the default, best-documented, and best-covered by Supertest examples; switch only with a measured reason |
## What NOT to Use
| Avoid | Why | Use Instead |
|-------|-----|-------------|
| TypeORM / NestJS 11 / Biome / Lefthook / pnpm-specific config copied from ecom-v0 | Master doc: v0 is historical context only; Nest 11 lost active support 2026-08-27 | NestJS 12 + Vite+ (this file) |
| Prisma 8 (RC) / unpinned `prisma` installs | npm `latest` now resolves to the Prisma 8 CLI; no `migrate dev`, no schema.prisma reading; 8 GA slipped; `$extends`, nested writes, atomic increment still missing | Pin Prisma 7.10.1 |
| Drizzle 1.0 RC in greenfield | Breaking changes per RC (RQB v2 swap, filter semantics) | Prisma 7 (or wait for Drizzle 1.0 GA) |
| TypeScript 7.0.x for the NestJS app | TS 7 has no programmatic API (planned 7.1); `@nestjs/swagger` peers require ^5.5\|\|^6.0; `@nestjs/cli` consumes the TS API | TypeScript 6.0.3 monorepo-wide; revisit after TS 7.1 stable (~2026-11-24) |
| Clerk webhooks as the provisioning mechanism | Master-doc decision: provision local user on first sign-in from the verified session; no public webhook endpoint needed (webhooks would expose an unauthenticated endpoint + Svix secret handling for no benefit) | `verifyToken()`/`authenticateRequest()` in a global Nest guard + lazy local-user upsert |
| `createRouteMatcher()` / `middleware.ts` (Clerk+Next 16) | Deprecated in @clerk/nextjs 7.5.14; Next 16 renamed middleware to `proxy.ts`; `<SignedIn>/<SignedOut>` replaced by `<Show>`; `ClerkProvider` must sit inside `<body>` (Cache Components) | `proxy.ts` + `clerkMiddleware()` + `auth().protect()`; run `npx @clerk/upgrade` codemods |
| Koyeb / Fly.io / Render for backend | Koyeb: new accounts need Pro $29/mo; Fly: no free tier; Render: excluded by master doc | Cloud Run (recommended) or Docker Compose |
| Supabase free as primary DB | Pauses after 1 week of inactivity, needs manual restore | Neon free |
| Any paid Better Stack tier / card on Better Stack | Over-quota ingestion is billable on paid plans | Free plan, no card, Vector-capped forwarding |
| Custom JWT issuance / password auth / refresh-token system | Master doc forbids; Clerk covers identity | Clerk session tokens + backend verification |
## Stack Patterns by Variant
- Backend stays Docker Compose + optionally Railway trial for ephemeral demos; document that "deployed" evidence is partially local; revisit hosting at Stage 2.
- Everything else (Neon, Clerk, Vercel, Better Stack) is unchanged — none of them requires a card.
- Define Zod schemas once in a shared package; Nest 12 Standard Schema pipes validate with them; `@nestjs/swagger` `standardSchemaConverter` reflects them into OpenAPI; `@hey-api/openapi-ts` zod plugin generates client-side schemas. One contract, both sides. If this coupling feels heavy, fall back to class-validator DTOs and skip shared schemas.
- Re-verify Neon compute quotas and Cloud Run limits against multi-service traffic before adoption (master doc §3 already mandates this re-evaluation).
## Version Compatibility
| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| NestJS 12 | Node ≥20.19 / ≥22.12 | `require(esm)` enables CJS apps; ESM-first for new projects |
| @nestjs/swagger 12 | NestJS ^12, TypeScript ^5.5 \|\| ^6.0, Node ^20.19 \|\| ≥22.12 | Verified from package.json of 12.1.1 |
| Next.js 16.4 | Node ≥20.9, TypeScript ≥5.1, React 19.3 | Turbopack default; 16.4 ships Cache Components + React 19.3 |
| @clerk/nextjs 7 (Core 3) | Next.js ≥16.0.10 (on 16), Node ≥20.9 | Core 3 GA 2026-03; requires `proxy.ts` naming on Next 16 |
| @clerk/backend 3 | Node ≥20.9, any Node backend (incl. Nest) | `verifyToken()` networkless with `jwtKey`, else JWKS via secretKey (cached) |
| Prisma 7.10 | Node ≥18.18 (uses `@prisma/adapter-pg`), driver-adapter style only | Pin CLI exactly; Prisma 8 RC is a different CLI |
| @hey-api/openapi-ts 0.99 | Node ≥22 | Pin exact (pre-1.0) |
| Playwright 1.65 | Node 22/24/26 (Node 20 dropped) | Docker images now ship Node 26 |
| Vitest 5 | Node ≥18; bundled in Vite+ | NestJS 12 ESM template defaults to Vitest |
| Vite+ 1.6 | Manages Node + pnpm/npm/yarn/bun | Framework-agnostic; does not replace `next build` / `nest build` |
## Sources
- **Next.js**: nextjs.org/blog/next-16 and /next-16-4 (official, HIGH); github.com/vercel/next.js/releases (16.4.6 latest, 2026-11-09)
- **NestJS**: github.com/nestjs/nest/releases (12.0.0 2026-08-27 → 12.4.x); InfoQ "NestJS 12: ESM, Standard Schema, Native Observability" (2026-10-19); endoflife.date/nestjs (support windows)
- **@nestjs/swagger**: github.com/nestjs/swagger releases 12.0.0–12.1.1 + package.json (peer deps, ESM, Standard Schema converter) — HIGH
- **TypeScript**: devblogs.microsoft.com "Announcing TypeScript 7.0" (2026-07-08); npm `typescript@7.0.2` latest, 6.0.3 side-by-side; TS 7.1 beta 2026-10-20
- **Prisma**: github.com/prisma/orm releases (7.10.1 latest, 8.0.0-rc.*); prisma.io/docs/orm/release-status (7 supported 18 mo post-8-GA; 6 security-only until 2026-11-19); revisit.tech "Node.js ORMs in 2026" (2026-11-09, cross-checked)
- **Drizzle**: orm.drizzle.team docs/latest-releases (1.0.0-rc.5, 2026-10-21); notes.drizzle.run RQB v2 — HIGH
- **Clerk**: clerk.com/pricing (Hobby free, 50,000 MRU, no card); clerk.com/articles/clerk-pricing-explained (2026-06-25, MRU vs MAU); npm @clerk/backend@3.29.0, @clerk/nextjs@7.9–7.10; clerk.com/docs upgrade guides (Core 3, Next 16, proxy.ts, createRouteMatcher deprecation)
- **Koyeb**: koyeb.com/docs/faqs/pricing + freetier.wiki/koyeb + hostmath.dev (Pro $29/mo for new accounts since 2026-02, card + $29 hold)
- **Railway**: railway.com/pricing + docs.railway.com/pricing/free-trial ($5/30-day trial, then Free $1/mo credit)
- **Cloud Run**: cloud.google.com/run/pricing + docs.cloud.google.com/free/docs/free-cloud-features (2M requests, 180k vCPU-s; billing account required; overage auto-bills)
- **Neon**: neon.com/docs/introduction/plans + neon.com/faqs/free-plan-limits-and-quotas (updated 2026-11-03: no card, suspension-not-billing overage)
- **Supabase/others**: fastero.com/blog/free-postgres-database (2026-11-12 comparison); snapdeploy.dev/state-of-free-hosting (2026)
- **Better Stack**: betterstack.com/pricing (free plan: 10 monitors/heartbeats, 3 GB logs+traces, 3-day retention; over-quota ingest billable on paid plans)
- **GitHub Actions**: docs.github.com/en/billing/managing-billing-for-github-actions (GitHub Free: $12/mo included compute ≈ 2,000 ubuntu-latest min since 2026-10-28 dollar-pool change; public repos free/unlimited on standard runners; **without a payment method, overage usage is blocked, not billed**)
- **Vite+**: voidzero.dev/posts/announcing-vite-plus-1-0 (2026-09-28); github.com/voidzero-dev/vite-plus/releases (1.6.0, 2026-11-11); viteplus.dev
- **pino**: npm pino@10.4.0 (2026-10-02)
- **Playwright**: github.com/microsoft/playwright/releases (1.65.1, 2026-11-13; Node 20 dropped)
- **Supertest/Zod**: @nestjs/swagger 12.1.1 package.json devDeps (supertest 7.3.1, zod 4.6.7)
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
