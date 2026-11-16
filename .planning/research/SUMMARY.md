# Project Research Summary

**Project:** ecom-v1 — marketplace-lite e-commerce (Stage 1: Complete Monolith)
**Domain:** Three-sided marketplace (customers, self-service merchants, minimum platform admin)
**Researched:** 2026-11-16
**Confidence:** HIGH overall (all four research files grounded in official docs, verified release data, and the authoritative master document + PROJECT.md Key Decisions); specific MEDIUM areas noted below

## Executive Summary

ecom-v1 is a portfolio-scale marketplace-lite e-commerce application whose point is demonstrating end-to-end engineering quality, not enterprise scale. Research confirms the already-agreed v1 scope is a **coherent, defensible MVP**: it covers the complete transaction loop (supply: merchant onboarding → catalogue → inventory; demand: discovery → cart → checkout → order; control: backend-enforced authz/ownership + minimum admin). The recommended approach is exactly what the master document mandates — a NestJS 12 modular monolith behind an OpenAPI contract, a Next.js 16 storefront consuming a generated typed client, PostgreSQL with strict server-side money/inventory/authorization invariants, and a backend → frontend → integration → deployment build sequence. The domain's hardest problems concentrate in one place: **the checkout/purchase boundary** (backend-derived totals, atomic conditional stock decrement, idempotent payment attempts with unknown-outcome reconciliation). Research provides battle-tested patterns for all of these; they must be designed in from day one, not hardened later.

The stack is fully verified as of Nov 2026 with three version traps that deserve respect: **pin Prisma exactly to 7.10.1** (npm's `latest` now resolves to the Prisma 8 RC CLI, which silently breaks Prisma 7 workflows), **stay on TypeScript 6.x** (TS 7 lacks the programmatic API `nest build`/`@nestjs/swagger` need; revisit after 7.1), and **pin `@hey-api/openapi-ts` exactly at 0.99.0** (pre-1.0). Hosting is the one genuinely open budget question: Neon (free, no card, suspension-not-billing overages) + Vercel are unambiguous, but the recommended backend host (Google Cloud Run free tier) requires a payment method on file — a direct conflict with the zero-spend "no automatic overages" constraint that **must be escalated to the owner before adoption**.

Key risks, in order of severity: (1) commerce-correctness bugs at checkout — oversell races, double-charges on retry, treating payment timeouts as failures — all mitigated by patterns documented in ARCHITECTURE.md and PITFALLS.md; (2) authorization holes (IDOR/role confusion) in a multi-merchant system — mitigated by scoped queries, a single global guard stack, and mechanical cross-tenant/role-matrix test suites; (3) integration-phase surprises from the mandated backend-first sequence (cross-origin Clerk token handoff, OpenAPI drift) — mitigated by freezing the contract early, generating the client in CI, and smoke-testing the deployed token path early; (4) zero-spend hosting traps (Neon CU-hour math, cold starts, keep-alive ping anti-pattern) — mitigated by quota math and a `DEPLOYMENT.md` limits table. A handful of small product decisions remain open with the owner (email notifications, refund semantics on cancel-after-payment, reviews deferral) — these are decisions to record, not blockers to planning.

## Key Findings

### Recommended Stack

Detail: `.planning/research/STACK.md`. The stack verifies the accepted master-document direction rather than re-litigating it; all versions checked against npm/official sources in Nov 2026.

**Core technologies:**
- **TypeScript 6.0.3 (pin)** — latest stable with the programmatic API NestJS tooling needs; TS 7 (Go-native) has no stable API yet, revisit after 7.1 (~2026-11-24)
- **Node.js 24 LTS** — common floor of every component (Nest 12, Playwright 1.65, hey-api all need ≥22)
- **NestJS ^12.4** — current major; ESM-ready, Standard Schema validation, built-in cookies/CSRF/security headers; 11.x lost active support 2026-08-27
- **Next.js 16.4.6 (`^16.4.6`, no canary) + React 19.3** — Turbopack default, active security cadence; Clerk Core 3 requires Next ≥16.0.10
- **PostgreSQL 16/17** (Neon free hosted; local Docker `postgres:17-alpine`) — plain relational model; money as integer paise
- **Prisma 7.10.1 — pinned EXACT (both `prisma` and `@prisma/client`)** with `@prisma/adapter-pg` — critical: unpinned installs resolve to the Prisma 8 RC CLI which cannot read `schema.prisma` or run `migrate dev`. Drizzle 1.0 and TypeORM rejected (RC churn / v0-artifact + behaviour churn)
- **Clerk** (`@clerk/backend` 3.29.x, `@clerk/nextjs` 7.10.x) — Hobby free (50,000 MRU, no card); backend verifies JWT networklessly via `verifyToken()`; no webhooks
- **Vite+ 1.6.x** as unified repo toolchain (`vp check/test/run/hooks/env`) — do NOT also install ESLint/Prettier/Biome/Lefthook/Husky/turbo; does not replace `next build`/`nest build`
- **pino 10.4** structured logging (mandatory), `@nestjs/swagger` 12 (OpenAPI source of truth), `@hey-api/openapi-ts` 0.99.0 (pinned exact; generated typed client), Vitest 5 + Supertest + Playwright 1.65, Docker Compose (local env + zero-spend fallback + Stage 2 load-test target)

**Hosting (zero-spend, verified terms):** Neon free (DB — no card, overages suspend instead of billing; watch 100 CU-hours and scale-to-zero cold starts) + Vercel Hobby (web, already decided) + **Cloud Run free tier recommended for API but requires owner-approved card-on-file escalation**. Excluded: Koyeb, Fly.io, Render (fail zero-spend or master doc). Fallback if owner refuses card: Railway trial for ephemeral demos + Docker Compose as the real deployed reference (weakens the reviewer-access criterion). Better Stack free: uptime monitors unconditional; log forwarding only with a Vector volume cap and never a card on file.

### Expected Features

Detail: `.planning/research/FEATURES.md`. The agreed v1 scope **validates fully against marketplace MVP table stakes** — every role's core loop is present, and two deliberate deviations (no guest checkout, no moderation queue) are documented owner decisions, not gaps.

**Must have (already agreed, launch-critical):**
- Clerk auth + display name + local user provisioning; admin bootstrap via env email list
- Public catalogue (search/sort/filter, admin-managed categories), product detail page
- Authenticated persistent cart (no guest, no merge)
- Checkout with backend-authoritative totals (₹40 flat shipping, free ≥ ₹500, integer paise) + deterministic mock payment (4 scenarios, idempotent, unknown ≠ failed)
- Order confirmation/history/details with purchase-time snapshots; lifecycle PENDING_PAYMENT → PAID → SHIPPED → DELIVERED / CANCELLED / PAYMENT_FAILED
- Self-service merchant onboarding, product CRUD, external-URL images, inventory with atomic decrement, seller order management
- Minimum admin (users, merchants, categories, order operations); server-side validation, ownership enforcement, tests
- Stock visibility on PDP and catalogue pagination are implied-in-scope — verify during phase planning

**Owner-review gaps (decisions to record, not auto-add):**
- **Transactional email notifications** on order/payment/shipping state changes — currently undefined (neither Active nor Out of Scope). Recommend: minimal v1 notifier with a log-based sink (zero-spend-compatible) or explicit deferral
- **Refund semantics when a PAID order is cancelled** — no REFUNDED state exists; recommend cancel-after-payment → CANCELLED + mock refund recorded on the attempt ledger (owner confirmation per §7)
- **Reviews/ratings** — recommend explicitly recording deferral in Out of Scope rather than leaving undefined
- *(Minor)* Terms/privacy static pages — owner may waive for a portfolio demo

**Defer (v1.x+ / v2+):** fuzzy search (master doc: "deferred, not abandoned" — natural first enhancement), wishlist, merchant analytics, promotions; then reviews, recommendations/personalization, real payments, semantic/AI search, native mobile (Stage 4), microservices (Stage 3).

### Architecture Approach

Detail: `.planning/research/ARCHITECTURE.md`. Three deployable pieces (Next.js web, NestJS API, one PostgreSQL DB) with the mock payment gateway as an **in-process module behind a `PaymentsGateway` port** — modeled as if external (own ledger, latency, inquiry endpoint) so a real provider later means a new adapter with zero order-module changes. This port is also the natural Stage 3 decomposition seam.

**Major components (Nest modules):**
1. `identity` — Clerk→local provisioning on first verified sign-in, admin bootstrap, account deletion/anonymization
2. `stores` — self-service merchant onboarding, store profile; root of the ownership chain (`users → stores.owner_user_id → products.store_id`)
3. `catalogue` — admin categories, product CRUD/publish/archive, external image URL validation, stock on products
4. `cart` — one persistent cart per user; stores intent only (product id + qty), never prices
5. `orders` — **CheckoutService is the dependency hub**: totals → atomic decrement → order TX (snapshots) → charge; state machine; customer/seller/admin views; cancellation + restock. No separate "checkout module" — checkout is a flow inside `orders`
6. `payments` — gateway port + mock adapter, payment-attempt ledger (idempotency key UNIQUE), inquiry, 4 deterministic scenarios
7. `admin` — thin orchestration over domain services with admin authorization
8. `common` — Clerk guard, role/ownership primitives, money utils (integer paise), PrismaService, Pino — **no domain rules**

**Key patterns:** (1) global Clerk guard → resolve-or-provision local user → all authz from the local row only; (2) single-statement atomic conditional stock decrement inside the checkout transaction (zero rows updated ⇒ 409, no order); (3) payment attempt ledger with UNKNOWN state + inquiry + same-key idempotent retry (transaction ends before the charge; outcome writes are a second short transaction); (4) `order_items` denormalizes `store_id` and snapshots purchase-time title/price — one order can span multiple merchants (the genuinely marketplace-shaped part; do not simplify into per-merchant orders).

### Critical Pitfalls

Detail: `.planning/research/PITFALLS.md` (14 pitfalls total; top 5 by severity):

1. **Trusting client-submitted totals/prices/quantities** — checkout accepts only `{productId, quantity}`; every purchase-critical number derived server-side inside one transaction; DTO validation rejects unknown money fields
2. **Oversell race (check-then-act)** — atomic conditional decrement (`updateMany` with `stock >= qty`, count 0 ⇒ rollback/409); no reservation layer exists to hide this bug; concurrent-checkout test is mandatory
3. **Non-idempotent payment retries** — client-generated idempotency key, UNIQUE on `payment_attempts`, same-key retry reuses the original attempt; a fresh attempt is only legitimate after a *known-failed* state
4. **Treating payment timeout/lost response as failure** — UNKNOWN attempt state + inquiry resolution; never a `catch` that transitions to PAYMENT_FAILED; Pino log fields must distinguish `unknown` from `failed`; restock only on *confirmed* failure
5. **IDOR / role confusion across merchants** — scope every query by ownership (`storeId`/`userId` in the WHERE), derive caller identity only from verified JWT + backend tables, 404 (not 403) for foreign resources, global auth guard + role guard + ownership resolution in that order, mechanical cross-tenant + role-matrix fixture suites

Also high-value: **Prisma/pooler traps on free-tier Postgres** (pooled `DATABASE_URL` vs `DIRECT_URL` for migrations from day one; explicit tx timeouts; never network calls inside a transaction), **cross-origin Clerk token handoff** (bearer header in the contract, `authorizedParties`, early deployed smoke test — the single most likely "discovered too late" item), **OpenAPI/client drift** (generate in CI, typecheck, fail on drift), and **zero-spend hosting quota math** (no keep-alive pings; reconciliation must survive host sleep — lazy on inquiry, not a background timer).

## Implications for Roadmap

Research strongly suggests ~10 phases in the mandated backend → frontend → integration → deployment order, mirroring the architecture research's build order (groups A–F). Phase names below are descriptive; the roadmapper assigns numbers (GSD phases ≠ master-document Stages).

### Phase 1: Monorepo & Platform Foundation
**Rationale:** Everything depends on it; several pitfalls are foundation-level decisions that are painful to retrofit.
**Delivers:** Monorepo scaffold (pnpm workspaces, apps/api + apps/web stubs), Vite+ toolchain, Docker Compose with local Postgres, Prisma 7 pinned + migration workflow (pooled/direct URLs), Pino logging, config, health endpoint, global validation/exception filters, OpenAPI emission pipeline + CI skeleton, Graphify install.
**Avoids:** Pitfall 10 (Prisma/pool traps — foundation decision), Pitfall 12 (OpenAPI drift — pipeline from day one), the "db push now, migrate later" debt pattern.

### Phase 2: Identity & Authorization
**Rationale:** Every module's authorization depends on local users and role resolution; the auth contract (bearer token transport) must be decided here, before any consumer exists.
**Delivers:** Clerk guard (networkless `verifyToken()` with PEM jwtKey, `authorizedParties`, clock-skew handling), resolve-or-provision local user (upsert-on-conflict), admin bootstrap via env email list, roles, profile completion, account deletion/anonymization; guard architecture + role-matrix test patterns established.
**Avoids:** Pitfalls 6–9 (IDOR pattern, role confusion, Clerk verification mistakes, provisioning races/lifecycle drift).

### Phase 3: Stores & Catalogue
**Rationale:** Products are FK-bound to stores and ownership resolves through stores; admin categories gate product creation.
**Delivers:** Self-service merchant onboarding + store profile; admin-managed categories; merchant product CRUD/publish/archive; external image URL validation; stock management; public browse/search/sort/filter endpoints; ownership-scoped queries as the established norm.
**Avoids:** Pitfall 6 (IDOR — cross-tenant fixture suite starts here); image-URL security mistakes (scheme/content-type validation).

### Phase 4: Cart & Payment Primitives
**Rationale:** Checkout is the dependency hub; its primitives (money handling, inventory decrement, payment ledger) must exist before the checkout flow is built. The payments port is defined here so `orders` is built against it.
**Delivers:** Cart module (one per user, items CRUD, intent-only, re-pricing at read time); payments module: `PaymentsGateway` port, mock adapter with 4 deterministic scenarios via explicit demo/test control parameter, attempt ledger with idempotency key UNIQUE + inquiry endpoint.
**Avoids:** Pitfall 3 (idempotency designed as core, not hardening), Pitfall 14 (deterministic scenario mechanism shared by tests and demo).

### Phase 5: Orders & Checkout (highest-risk phase)
**Rationale:** The purchase boundary where all correctness invariants converge; architecture research explicitly flags this as the sequence deserving the deepest phase-level research and test coverage.
**Delivers:** CheckoutService orchestration (derive totals → atomic decrement → order TX with purchase-time snapshots → charge via port); order state machine; unknown-outcome reconciliation on idempotent retry; customer/seller/admin order endpoints; cancellation + restock; concurrent-decrement and same-key-retry tests.
**Avoids:** Pitfalls 1, 2, 4, 5 (the four commerce-correctness pitfalls are all designed into this phase's transaction and state machine).

### Phase 6: Admin, Contract Freeze & Seed
**Rationale:** Admin reuses finished domain services (thin); the OpenAPI contract freeze is the backend→frontend handoff gate mandated by the master document.
**Delivers:** Minimum admin endpoints (users, merchants, categories, order operations); seed/demo data; full API suite green; openapi.json emitted and the generated client contract frozen; journey flows documented against the contract.
**Avoids:** Pitfall 12 (drift — contract frozen before any frontend code); Pitfall 6/7 verification (cross-tenant + role-matrix suites complete by end of backend).

### Phase 7: Frontend — Customer Storefront
**Rationale:** Frontend builds only against the frozen contract via the generated client; the customer journey is the largest and most demo-critical surface.
**Delivers:** Generated api-client wired with auth header injection; storefront browse/product pages; Clerk auth + profile; cart UI; checkout UI with idempotency key and the honest "verifying payment…" unknown state; order confirmation/history/details.
**Avoids:** Pitfall 13 (cross-origin token handoff implemented per contract), Pitfall 1/4 UI side (never display client totals as authoritative; unknown ≠ failed in UX).

### Phase 8: Frontend — Seller Dashboard & Admin Console
**Rationale:** Same contract, second and third role surfaces; smaller than the storefront.
**Delivers:** Seller onboarding flow, product/inventory management, seller order management with allowed actions and meaningful "why blocked" errors; minimal admin console. Frontend route guards are UX only (backend is the boundary).
**Avoids:** Pitfall 7 (frontend guards mistaken for security).

### Phase 9: E2E Integration
**Rationale:** Journey verification comes after both subsystems exist, per the mandated sequence.
**Delivers:** Playwright journeys for customer/merchant/admin — including all four payment scenarios and the unknown-outcome retry path; deployed token-handoff smoke test; client-regeneration CI job failing on drift.
**Avoids:** Pitfall 14 (storage-state auth, per-worker fixtures, no `waitForTimeout`, backend-state polling), Pitfall 13 (deployed smoke test), "looks done but isn't" checklist items.

### Phase 10: Deployment & Release
**Rationale:** Zero-spend provider selection needs quota math and the card-on-file escalation resolved; deployment is last so nothing blocks on it.
**Delivers:** Vercel + Neon + backend host (per owner decision); `DEPLOYMENT.md` (limits/cold-start/spend-boundary table); seed-as-runbook; Better Stack monitors (capped) or local-Pino fallback; Starlight docs; reviewer walkthrough.
**Avoids:** Pitfall 11 (quota math, no keep-alive timers, cold-start expectations), Pitfall 8 (clock/NTP runbook item for the deployed host).

### Phase Ordering Rationale

- **Dependency-driven backend:** identity → stores → catalogue → cart/payments → orders. Each module's authorization and FKs resolve to its predecessor; checkout orchestrates primitives that must exist first.
- **Contract freeze as an explicit gate (end of Phase 6):** the mandated backend-first sequence makes drift dangerous; freezing + generating before frontend work converts the sequence from a risk into an asset.
- **Payments before orders finalization:** `orders` is built against the `PaymentsGateway` port (define port + fake when starting orders if the mock adapter lags) — both complete before the contract freeze.
- **Deployment last, but decided early:** the Cloud Run card-on-file escalation should be surfaced to the owner at roadmap time, not in Phase 10; the Docker Compose fallback guarantees Phase 9/10 are never blocked on hosting.
- **Frontend split into two phases** (customer vs seller+admin) keeps each phase implementation-sized and lets the demo-critical customer journey land first.

### Research Flags

Phases likely needing deeper research during planning (`/gsd-plan-phase --research-phase`):
- **Phase 5 (Orders & Checkout):** the four commerce-correctness pitfalls converge here; needs race-test design, state-machine table, scenario-matrix test planning. Architecture research explicitly names this as the highest-risk sequence.
- **Phase 2 (Identity & Authorization):** no official Clerk NestJS SDK (MEDIUM confidence — community guides use `@clerk/backend` directly); re-verify at phase time and design the guard + provisioning + role stack carefully. Also settles the cross-origin token transport contract.
- **Phase 10 (Deployment):** backend host unselected pending owner card-on-file decision; Neon CU-hour math, cold-start/reconciliation design, and Better Stack cap verification are all phase-specific.
- **Phase 4 (Payments):** moderate flag — the pattern is well specified in research, but the deterministic scenario control mechanism and ledger schema deserve a focused design pass.

Phases with standard patterns (skip research-phase, plan directly):
- **Phase 1 (Foundation):** NestJS/Vite+/Prisma scaffolding is well-documented; the only novelty is the Prisma version pin, already researched.
- **Phase 3 (Stores & Catalogue):** standard CRUD + scoping patterns, fully specified by architecture research.
- **Phase 7–8 (Frontend):** Next.js 16 App Router + generated client is well-documented; contract already frozen. (Watch Clerk's Next 16 renames: `proxy.ts`, `<Show>`, `ClerkProvider` in `<body>` — codemods exist via `npx @clerk/upgrade`.)
- **Phase 9 (Integration):** Playwright patterns documented; the project-specific scenario coverage is specified in PITFALLS.md.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All versions verified against npm/GitHub releases/official pricing Nov 2026; three pinned-exact traps documented (Prisma 7.10.1, TS 6.0.3, hey-api 0.99.0) |
| Features | HIGH | Stable domain knowledge corroborated by multiple 2026 industry sources; agreed scope validated against table stakes; open items are owner decisions, not unknowns |
| Architecture | HIGH | Grounded in master-document constraints + PROJECT.md Key Decisions; Clerk×NestJS integration verified against current docs (one MEDIUM-confidence sub-point: no official NestJS SDK) |
| Pitfalls | HIGH (commerce patterns) / MEDIUM (hosting mechanics) | Correctness patterns are established domain consensus reinforced by master-doc constraints; backend host unselected so deployment mechanics remain partially open |

**Overall confidence:** HIGH — sufficient to build the roadmap now.

### Gaps to Address

- **Backend host + card-on-file (escalation, do not defer to Phase 10):** Cloud Run free tier is the research recommendation but requires a billing account with auto-billing capability — the one genuine conflict with the zero-spend constraint. Owner decision needed at roadmap time; documented fallbacks exist (Railway trial + Docker Compose reference). Until decided, keep `DEPLOYMENT.md` provider-agnostic.
- **Owner product decisions pending (record during roadmap/planning):** email notifications (undefined — recommend minimal log-sink notifier or explicit deferral), refund semantics for cancel-after-payment (recommend CANCELLED + mock refund on attempt ledger; needs §7 confirmation), reviews/ratings (recommend recording explicit deferral in Out of Scope), terms/privacy pages (minor; owner may waive).
- **Clerk×NestJS SDK status (MEDIUM):** no official NestJS SDK found; re-verify during Phase 2 planning; thin custom guard is the default.
- **Client generator choice:** STACK recommends `@hey-api/openapi-ts` 0.99 (SDK + types + Zod plugin); ARCHITECTURE sketches `openapi-typescript` + `openapi-fetch` and mentions Orval as an option. All three are viable; decide at Phase 1 planning (recommendation: follow STACK default unless size concerns emerge). Do not hand-write client types under any option.
- **TypeScript 7.1 (stability ~2026-11-24):** stay on TS 6.x for Stage 1; note as a revisit item, not a blocker.
- **Neon CU-hour budget:** 100 CU-hours/month with an always-warm 0.25 CU compute exhausts in ~2–3 weeks; Phase 10 must do the quota math and design for sleep (no keep-alive pings; lazy inquiry-based reconciliation instead of background timers).
- **Stage 2 (separate milestone):** load testing must run against local Docker Postgres, not Neon, and account for cold starts; out of this roadmap by owner decision.

## Sources

### Primary (HIGH confidence)
- `master-document.md` — authoritative brief (constraints, staging, sequencing, commerce boundaries)
- `.planning/PROJECT.md` — Active requirements, Out of Scope, Key Decisions (2026-11-16)
- Official docs: Next.js 16/16.4 release notes; NestJS 12 releases + InfoQ; `@nestjs/swagger` package metadata; TypeScript 7 announcements; Prisma releases/status; Drizzle release notes; Clerk pricing/docs/upgrade guides (Core 3, `verifyToken`, `proxy.ts`); Neon plans/FAQs; Cloud Run pricing/free-tier docs; Better Stack pricing; GitHub Actions billing; Vite+ 1.0/1.6 announcements; Playwright releases
- Established commerce engineering practice: idempotency keys, atomic conditional decrement, purchase-time snapshots (domain consensus)

### Secondary (MEDIUM confidence)
- 2026 marketplace/ecommerce industry guides (Appfyl, Easify, Toimi, Cubix, Sharetribe, PlanSmith, Baymard-derived storefront sources) — feature table-stakes consensus
- Community Clerk×NestJS integrations (no official SDK) — re-verify at phase time
- openapi-typescript / openapi-fetch / Orval comparisons (buildwithfern, orval.dev) — client-generator choice
- Free-hosting comparisons (fastero, snapdeploy, freetier.wiki) — corroborates excluded hosts

### Tertiary (LOW confidence / validation pending)
- Backend host zero-spend mechanics beyond documented terms (Cloud Run card-on-file guardrails; Railway trial behaviour) — depends on owner decision + account-level verification
- Better Stack ingestion behaviour on free plan without a card — verify after account creation; master doc pre-authorizes local-Pino fallback

---
*Research completed: 2026-11-16*
*Ready for roadmap: yes*
