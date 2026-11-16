# Stack Research

**Domain:** Marketplace-lite e-commerce (NestJS API + Next.js web + PostgreSQL, monorepo)
**Researched:** 2026-11-16
**Confidence:** HIGH overall (versions verified against npm/official sources Nov 2026); individual caveats noted inline

This research **verifies** the accepted direction in `master-document.md` §4 — it does not re-litigate it. Every version below was checked against npm, GitHub releases, or official pricing/docs pages during the week of 2026-11-09.

---

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

**Recommendation: Prisma ORM 7.10.x with `@prisma/adapter-pg`. Confidence: HIGH.**

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

---

## Hosting (zero-spend) — backend + hosted PostgreSQL

The constraint (master doc §4/§5): no paid subscriptions, no unavoidable usage charges, **no automatic paid overages**, no service that can incur charges without explicit owner approval; Render is excluded; a local/demo fallback must be maintained.

### Database: **Neon free plan — recommended. Confidence: HIGH (terms verified 2026-11-03 update on neon.com)**

| Term (verified) | Value |
|---|---|
| Price | $0/month, permanent (not a trial), **no credit card required** |
| Storage | 1 GB per project (20 GB total across projects) |
| Compute | 100 CU-hours per project per month, autoscaling up to 2 CU (~8 GB RAM); scale-to-zero after 5 min idle (cannot be disabled — which is *good* for zero-spend) |
| Egress | 5 GB per project per month |
| Overage behaviour | **Suspends compute / blocks growing writes until next cycle — explicitly does not bill overages on Free; no data deleted.** Because no card is on file, charges are physically impossible. |
| Connection pooling | Built-in PgBouncer accepts up to 10,000 client connections |

100 CU-hours ≈ a 0.25-CU compute running ~400 h/month — far more than a demo app with scale-to-zero needs. **How charges are prevented: no payment method exists on the account; overages suspend instead of billing.** Watch-outs: warm-up latency of a few hundred ms after idle (acceptable); 1 GB storage cap means keep large blobs (none here — image URLs only) out of the DB; Stage 2 load tests should run against the local Docker Postgres, not Neon.

Alternative considered: **Supabase free** (500 MB, no card) — but projects **pause after 1 week of inactivity** and require manual restore, which is a terrible property for a reviewer/demo deployment. Aiven free (1 GB, 1-CPU VM) is viable but pauses after inactivity notices and lacks pooling. Neon wins on "always wakes automatically, never bills".

### Backend compute — candidates

**Recommended: Google Cloud Run free tier. Confidence: MEDIUM-HIGH (limits verified; zero-spend requires owner-approved guardrails — escalation item).**

| Term (verified from cloud.google.com/run/pricing + free-tier docs, 2026-11) | Value |
|---|---|
| Free tier | 2M requests/month + 180,000 vCPU-seconds + 360,000 GiB-seconds (request-based billing, Tier-1 price basis), pooled per billing account |
| Fit | A demo marketplace at visitor scale stays well inside the free tier: CPU only bills while a request is open; scale-to-zero; no minimum instances |
| ⚠️ Billing account | A **billing account (payment method) is required**; usage above free tier **auto-bills** — this is the one genuine conflict with "no automatic paid overages" |
| How charges are prevented | (1) request-based billing with **0 minimum instances** so idle cost is exactly $0; (2) set **max instances = 1** so worst-case spend is capped at one small instance; (3) GCP **budget alert** at $1; (4) written owner approval for card-on-file. With those in place the realistic bill is $0; the residual risk is a bug keeping requests hot (mitigated by max instances) |
| Notes | Egress free allowance is only 1 GiB NA — fine for a JSON API; static assets live on Vercel |

**Why not the others:**

| Candidate | Verified state (Oct–Nov 2026) | Verdict |
|---|---|---|
| **Railway** (free plan) | Free plan: $0/mo with **$1 usage credit/month, no rollover**, 1 project / 3 services, 0.5 GB RAM, 1 replica, no card needed. $1 ≈ 100 MB of resident RAM for a month — an always-on NestJS service exhausts it in days and then **stops** (safe but useless). $5 one-time/30-day trial is bigger but a fuse. | Compliant-but-inadequate. Viable only as a short-lived demo window during the trial. Not primary. |
| **Koyeb** | Since 2026-02: card required ($29 hold), new accounts default to **Pro $29/month** (Mistral AI acquisition); free instance exists only inside a paid plan for new signups. | **Excluded** — fails zero-spend for a new account. |
| **Fly.io** | Free allowances ended 2024; trial = 2 machine-hours or 7 days; card required to keep anything running; ~$1.94/mo cheapest machine. | **Excluded** — no free tier. |
| **Render** | Excluded by master doc. | Excluded. |
| **Oracle Cloud Always Free** | 2 ARM OCPUs / 12 GB RAM (halved 2026-06), card for verification, no auto-charge beyond always-free, idle instances reclaimable, capacity availability unreliable. | Legitimate backup: strongest free compute and can also host Postgres, but it is a self-managed VM (patching, reverse proxy, storage sizing) — more ops than a portfolio project needs. Mention as fallback if Cloud Run is rejected. |
| **SnapDeploy free** | No card, 4 containers × 512 MB, **100 container-hours/month**, sleeps after 15 min. | Technically compliant, but a very small vendor — longevity risk for a deployment that should stay reachable. Not primary. |

**Overall hosting recommendation:** Neon (DB) + Cloud Run (API) + Vercel (web, already decided, Hobby plan with provider hostname) + Docker Compose as the mandatory local/demo fallback (`docker compose up` runs the full stack with local Postgres — this is also the Stage 2 load-test environment). **The Cloud Run card-on-file is the single open budget decision and must be escalated to the owner before adoption**; if the owner refuses card-on-file, the compliant fallback is running the API on Railway only within its $5 trial for demos and keeping the Docker Compose environment as the real "deployed" reference — but that weakens the "reviewer can access the deployed app" completion criterion, which is why Cloud Run is recommended.

### Better Stack free tier — terms verified. Confidence: HIGH

From betterstack.com/pricing (re-checked Nov 2026, "Free for personal projects, $0/month"):

- **10 monitors & heartbeats**, 1 status page, Slack + e-mail alerts (free monitors check every ~3 min; 30-second checks are paid)
- **3 GB logs retained for 3 days** (3 GB traces for 3 days; 30 GB metrics — the master-doc claim is confirmed)
- 100,000 exceptions/month, 5,000 session replays (not needed here)
- No credit card required for the free plan

**Zero-spend conditions for ecom-v1:**
1. **Never add a payment method** to the Better Stack account — without a card, over-quota ingestion cannot be charged.
2. Better Stack paid telemetry bills over-quota ingestion ($0.10/GB ingest) — on the free plan without a card the safe assumption is ingestion stops/limits rather than bills, but **do not rely on it**: ship Pino logs through Vector with a **drop/sample rule that caps forwarded volume well below 3 GB/3 days** (Pino stays the mandatory local source of truth either way).
3. Uptime monitors (API health + web homepage, 2 of 10 monitors) carry no ingestion risk at all — include them unconditionally.

If any of this cannot be verified after account creation, master doc §3 already specifies the fallback: local Pino observability only.

### Observability summary

- **Pino 10.4.0 structured logs — mandatory, local-first** (stdout JSON; `pino-pretty` in dev only).
- Better Stack: uptime monitors yes; log forwarding yes only with the Vector cap above; never with a card on file.

---

## Installation

```bash
# Monorepo root (Vite+ manages Node/pnpm)
curl -fsSL vite.plus | bash     # installs `vp`; then: vp env use node 24, vp install

# apps/api (NestJS 12)
pnpm add @nestjs/core@^12 @nestjs/common@^12 @nestjs/platform-express@^12 \
  @nestjs/config @nestjs/swagger@^12 @prisma/client@7.10.1 @prisma/adapter-pg@7 \
  pino@^10 nestjs-pino @clerk/backend@^3 \
  reflect-metadata rxjs

pnpm add -D -E prisma@7.10.1 vitest@^5 supertest@^7 @types/supertest typescript@6.0.3

# apps/web (Next.js 16)
pnpm add next@^16.4.6 react@^19 react-dom@^19 @clerk/nextjs@^7

pnpm add -D -E @hey-api/openapi-ts@0.99.0 playwright@^1.65

# Repo root dev tooling is Vite+ itself (vite-plus) — do NOT also install
# eslint, prettier, biome, lefthook, husky, or turbo.
```

> Pinned-exact (`-E`) packages are intentional: `prisma@7.10.1` (npm `latest` tag = Prisma 8 CLI — unpinned installs break Prisma 7 projects) and `@hey-api/openapi-ts@0.99.0` (pre-1.0, vendor explicitly recommends exact pinning).

---

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

**If owner rejects card-on-file for Cloud Run:**
- Backend stays Docker Compose + optionally Railway trial for ephemeral demos; document that "deployed" evidence is partially local; revisit hosting at Stage 2.
- Everything else (Neon, Clerk, Vercel, Better Stack) is unchanged — none of them requires a card.

**If the team adopts Zod as the shared validation vocabulary:**
- Define Zod schemas once in a shared package; Nest 12 Standard Schema pipes validate with them; `@nestjs/swagger` `standardSchemaConverter` reflects them into OpenAPI; `@hey-api/openapi-ts` zod plugin generates client-side schemas. One contract, both sides. If this coupling feels heavy, fall back to class-validator DTOs and skip shared schemas.

**If Stage 3 (microservices) is ever activated:**
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

---
*Stack research for: ecom-v1 marketplace-lite (Stage 1 — Complete Monolith)*
*Researched: 2026-11-16*
