# ecom-v1

## What This Is

A portfolio-scale, marketplace-lite e-commerce application where independent merchants offer products through a shared storefront. Customers discover products, maintain a persistent cart and complete a simulated-purchase journey; merchants self-onboard and run their own store, catalogue, inventory and seller-facing orders; platform administrators perform the minimum central oversight. It exists to demonstrate end-to-end engineering quality — design, build, test, deploy, operate and explain — not to become an enterprise marketplace.

## Core Value

A customer can discover a merchant's product, buy it through a safe, backend-enforced checkout (authoritative totals, validated inventory, deterministic mock payment with honest unknown-outcome handling), and the resulting order is correctly visible and actionable to the right merchant — with ownership and authorization enforced server-side throughout.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Customer registration/sign-in via Clerk with required display name
- [ ] Public storefront, catalogue, product details and basic discovery (search, sort, filter)
- [ ] Authenticated persistent customer cart (no guest carts, no merge)
- [ ] Checkout with backend-derived totals (items + ₹40 flat shipping, free ≥ ₹500) and deterministic mock payment
- [ ] Customer order confirmation, history and details
- [ ] Self-service merchant onboarding, store profile and basic store management
- [ ] Merchant product CRUD: create, edit, publish, archive; images chosen from the admin-curated gallery
- [ ] Admin-curated image gallery: admin-only CRUD of validated free stock image URLs with category/tags metadata; merchants select (multiple) images; ~200 seeded; soft-deactivate with graceful fallback
- [ ] Merchant basic inventory management for own products
- [ ] Seller-facing order management with backend-enforced permissions and allowed actions
- [ ] Minimum platform-admin capability: oversight of users, merchants, category configuration and order operations
- [ ] Server-side validation, resource-ownership enforcement and data-integrity protections
- [ ] Automated tests for business rules, API behaviour and end-to-end journeys
- [ ] Docker/Docker Compose local development; repeatable CI/CD (GitHub Actions)
- [ ] Pino structured logging, health visibility, OpenAPI contract + generated client
- [ ] Starlight documentation site; seed/demo data with reviewer-friendly journey walkthrough

### Out of Scope

- Stage 2–5 work (load testing/hardening, microservices, mobile, advanced ops) — separate milestones; Stage 2 planned after Stage 1 ships
- Fuzzy search — deferred, not abandoned (basic search only in v1)
- Guest carts and cart merging — excluded by master document
- Real payment processing or any real card data — forbidden; mock payment must never represent simulated outcomes as real processing
- Product variants / configurable products — keep product model simple
- Merchant image uploads or dedicated image storage — validated external URLs only
- Manual merchant approval queue — onboarding is self-service
- Enterprise admin/moderation/trust-and-safety platform — minimum admin capability only
- Storybook — deferred, not a Stage 1 requirement
- Better Stack hosted observability — conditional only; include solely if a verified zero-spend cap is possible, otherwise local Pino observability

## Context

- Greenfield: repository is deliberately unscaffolded (docs only). No apps, packages, manifests or CI exist yet.
- `master-document.md` is the authoritative project brief (approved product requirements, stages, technology direction, constraints). This PROJECT.md summarizes; the master document wins on conflict.
- `ecom-v0` (github.com/chinmayghule/ecom-v0) is historical context only — do not copy its stack (pnpm/Biome/Lefthook/NestJS 11/TypeORM).
- Stage terminology: **Stage** = long-term deliverable in the master document (this project's Stage 1 = "Complete Monolith"); **GSD phase** = implementation-sized unit in `.planning/`. Never conflate the numbering.
- Implementation sequencing is mandated: **backend → frontend → integration → deployment** (revised 2026-11-16 by owner decision). Backend planning must still model customer and merchant journeys so API contracts serve their real consumers.
- Discovery decisions (Section 7 of master document) were resolved with the owner on 2026-11-16 — see Key Decisions.
- Three user groups with distinct journeys: customers, self-service merchants, minimum platform admins. A person may be a customer first and later activate merchant capabilities; admin privileges are separate.

## Constraints

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

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Roadmap covers Stage 1 only; Stage 2 = follow-on milestone | Keep phases certain; Stage 2 is measurement on a working system | — Pending |
| Admin bootstrap via env-configured email list | Clerk has no app roles; backend grants admin on first sign-in of matching verified email; simple, auditable | — Pending |
| Local user provisioned on first sign-in from verified Clerk session | No public webhook endpoint needed; deletion anonymizes profile, keeps orders for integrity | — Pending |
| Admin-managed category list; one category per product | Simple filtering, no merchant-invented taxonomies | — Pending |
| Products self-publish (reactive takedown only) | No approval queue in initial experience per master document | — Pending |
| No inventory reservation; stock validated at checkout; atomic conditional decrement prevents oversell | Master doc: cart never reserves; simplest correct inventory behaviour | — Pending |
| Order lifecycle: PENDING_PAYMENT → PAID → SHIPPED → DELIVERED, plus CANCELLED and PAYMENT_FAILED; customer/admin cancel until shipped; merchant marks shipped | Minimum correct, demonstrable lifecycle | — Pending |
| Shipping: flat ₹40 per order, free at ≥ ₹500; currency INR, money stored as integer paise | Owner-specified; backend derives totals | — Pending |
| Mock-payment unknown outcome: idempotency key + inquiry endpoint over attempt ledger; same-key retry reuses original attempt | Distinguishes unknown from failed; repeatable scenarios | — Pending |
| Account deletion anonymizes personal data; orders retained with anonymized buyer reference | Merchant/admin order history stays consistent | — Pending |
| Image gallery module (added 2026-11-16, refines master doc "validated external image URLs"): admin-only CRUD of curated free stock image URLs (~200 seeded, name/category/tags metadata); merchants pick (multiple) product images from the gallery — no uploads, no arbitrary URLs; admin delete = soft-deactivate with graceful product placeholder | Centralizes validation, prevents arbitrary merchant URLs, handles image-deletion edge case | — Pending |
| Node/pnpm isolation: pnpm workspaces as package manager; Node version pinned via `.nvmrc` + `engines` + Corepack `packageManager` field; Docker images pin the same Node version; no bun as runtime | Mature monorepo default for Next.js + NestJS; version isolation across local/CI/Docker; bun adds ecosystem friction for no needed benefit | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-11-16 after initialization*
