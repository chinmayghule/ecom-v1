# Roadmap: ecom-v1 (Stage 1 — Complete Monolith)

## Overview

This roadmap delivers Stage 1 of the marketplace-lite e-commerce application: a complete transaction loop where customers discover and buy merchant products through a safe, backend-enforced checkout, merchants self-onboard and run their stores from an admin-curated image gallery, and platform admins hold minimum central oversight — with authorization, ownership and money handled server-side throughout. Phases follow the mandated subsystem sequence: **backend first** (Phases 1–4, ending in the OpenAPI contract freeze + generated client as the handoff gate), then **frontend** (Phases 5–6, built only against the frozen contract), then **integration/E2E** (Phase 7), then **deployment/release** (Phase 8). Stage 2 (Hardened Monolith) is a separate follow-on milestone and is out of scope here.

**Mapping convention:** each requirement is mapped to the phase that delivers the majority of its substance. Backend-enforced rules (money, inventory, authorization, state machines, idempotency) map to the backend phase that implements and tests them; actor-facing requirements whose remaining substance is presentation (storefront browsing, dashboards, labels) map to the frontend phase. Backend-phase success criteria are verified through the API/integration-test harness (the web UI arrives later); frontend/journey modelling in Phase 1 ensures the API contracts serve their real consumers.

**Test-during-subsystem expectation:** every backend phase delivers its own automated tests (unit, integration, API — including cross-tenant and role-matrix suites from the first merchant resources onward). Browser E2E journey tests are the explicit concern of Phase 7, after both subsystems exist.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

- [ ] **Phase 1: Platform Foundation & Identity** - Runnable monorepo + Docker/CI foundation; verified Clerk sessions become local users with server-enforced roles and account lifecycle
- [ ] **Phase 2: Gallery, Stores & Catalogue (Backend)** - Image gallery, merchant self-onboarding, product/inventory management and category governance at the API level
- [ ] **Phase 3: Cart, Checkout, Payments & Orders (Backend)** - The transaction core: persistent carts, backend-authoritative totals, atomic inventory, deterministic mock payment, order lifecycle
- [ ] **Phase 4: Admin Backend & Contract Freeze** - Minimum platform-admin APIs; OpenAPI contract frozen and typed client generated as the backend→frontend handoff gate
- [ ] **Phase 5: Customer Storefront (Frontend)** - Complete customer buying journey in the UI against the frozen contract
- [ ] **Phase 6: Seller & Admin Dashboards (Frontend)** - Merchant dashboard and admin console UIs against the frozen contract
- [ ] **Phase 7: Integration & E2E Journeys** - Playwright journey verification of customer/merchant/admin flows; full suite green in CI
- [ ] **Phase 8: Deployment & Release** - Zero-spend hosting with persistent data, seeded demo, deployed smoke test, docs and reviewer walkthrough

## Phase Details

### Phase 1: Platform Foundation & Identity
**Goal**: A runnable, CI-tested monorepo where a verified Clerk session becomes a local application user with the right role, and every endpoint already enforces validation, authorization and ownership server-side
**Depends on**: Nothing (first phase)
**Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05, AUTH-06, OPS-01, OPS-03, OPS-05
**Success Criteria** (what must be TRUE):
  1. A fresh clone runs the entire local environment with one Docker Compose command (API + PostgreSQL); the health endpoint responds and every request emits Pino structured logs; a push triggers a green GitHub Actions pipeline (lint/typecheck/test).
  2. A visitor can register through Clerk with email and a required display name, and their first verified sign-in provisions a local application user with no webhook endpoint involved.
  3. A user remains signed in across browser sessions and can sign out; a verified email matching the admin env-configured list is granted the platform-admin role on first sign-in.
  4. A user can delete their account; personal profile data is anonymized while order records are retained with an anonymized buyer reference.
  5. Every API endpoint rejects unauthenticated/invalid requests and denies access to other users' resources — enforced server-side and proven by cross-user and role-matrix tests.
**Plans**: 9 plans

Plans:
- [x] 01-01-PLAN.md — Verify the SUS Vitest dependency before any install
- [ ] 01-02-PLAN.md — Create the pinned pnpm/Vite+ workspace, NestJS API, and test harness
- [ ] 01-03-PLAN.md — Resolve account-deletion, merchant-closure, tombstone, and Clerk-revocation policy
- [ ] 01-04-PLAN.md — Establish the Prisma schema, migration, and database runtime foundation
- [ ] 01-05-PLAN.md — Add global validation, Pino logging, health probes, and Docker Compose
- [ ] 01-06-PLAN.md — Verify Clerk sessions and provision race-safe local users with capabilities
- [ ] 01-07-PLAN.md — Enforce capabilities/ownership and define the Clerk profile/session contract
- [ ] 01-08-PLAN.md — Implement owner-approved account deletion, merchant closure, and provider revocation
- [ ] 01-09-PLAN.md — Add CI, phase acceptance tests, journey contracts, and clean-snapshot verification

Notes:
- Toolchain decision: pnpm workspaces + Node pinned via `.nvmrc` + `engines` + Corepack `packageManager`; Docker images pin the same Node version (see PROJECT.md Key Decisions). Verify exact Node version against NestJS 12's ≥22.12 requirement at planning; pin exact package versions per STACK.md (Prisma 7.10.1, TS 6.x, @hey-api/openapi-ts 0.99.0).
- Package-manager pin (verified in this environment on 2026-11-16): `packageManager` = `pnpm@11.5.2`, provisioned by Corepack 0.36.0. `research/STACK.md`'s "pnpm 12 workspaces" line is research-level prose, not an owner-locked version — PROJECT.md locks only "pnpm workspaces + Corepack `packageManager`". A different pnpm major is an owner change and is escalated at execution time, never adopted silently.
- Per-phase validation contract: `.planning/phases/01-platform-foundation-identity/01-VALIDATION.md` (framework, sampling rate, per-task verify map, Wave 0 gaps, manual-only checks).
- Backend phases verify Clerk-facing criteria through the API integration harness (Clerk test sessions); the web app wires the Clerk UI in Phase 5.
- **Journey modelling (mandated):** this phase documents the customer, merchant and admin journeys and maps them to planned API endpoints, so all later contracts serve their real consumers. The highest-risk phase-specific research areas per SUMMARY.md: Clerk×NestJS guard design (no official SDK — re-verify at planning), Prisma 7.10.1 pinning + pooled/direct URL setup, TS 6.x pin.
- Gallery seed data design starts here only as schema capacity; the gallery module itself is Phase 2. Phase 1 scope for this item is exactly one foundation table (`gallery_assets`) able to hold the later ~200 curated free-stock image records with source URL, name, category, tags, and a soft-deactivation marker (Plan 01-04), plus a scope statement in the journey contract (Plan 01-09). No gallery module, gallery API, admin gallery CRUD, ~200-image seed pipeline, merchant picker, or product-image behaviour is built in Phase 1.
- Clerk-facing criteria are proven through the API integration harness and the documented Clerk configuration contract. Browser sign-up/sign-in/session-persistence/sign-out are **not** browser-verified in Phase 1 — the browser UI is Phase 5 — and are recorded as manual-only checks in `01-VALIDATION.md`.

### Phase 2: Gallery, Stores & Catalogue
**Goal**: The supply side works at the API level: the admin-curated image gallery exists and is seeded, merchants self-onboard and manage their own catalogue and inventory from it with server-enforced ownership, categories are admin-governed, and the public catalogue is queryable
**Depends on**: Phase 1
**Requirements**: GALL-01, GALL-02, GALL-03, GALL-04, GALL-05, MERC-01, MERC-02, MERC-03, MERC-04, MERC-05, MERC-08, ADMN-03, ADMN-04
**Success Criteria** (what must be TRUE):
  1. A signed-in user can self-onboard as a merchant with no manual approval and edit their store profile; another merchant's store/products/orders are inaccessible server-side (not-found/denied, never leaked).
  2. A merchant can create, edit, publish and archive products, choosing images only from the admin-curated gallery (arbitrary external URLs are rejected), and manage stock levels for their own products.
  3. An admin can add and edit gallery images using validated free-stock-image URLs with name, category and tags; admin deletion soft-deactivates (hidden from selection, record retained); the admin can view and filter the gallery by category, tags and name.
  4. The gallery is seeded with ~200 curated free stock image URLs covering common product types (e.g. shirts, trousers, skirts, smartphones).
  5. The admin manages the category list that gates product creation (one category per product) and can reactively unpublish a merchant product; the public catalogue API exposes published products with text search, category filter, sorting and stock availability.
**Plans**: TBD (est. 4–5 plans: gallery module + validation; seed pipeline for ~200 images; merchant onboarding + store profile; product CRUD/publish/archive/inventory with gallery-scoped images; categories + admin takedown + public catalogue API + cross-tenant test suite)

Notes:
- Gallery backend comes **before** product CRUD inside this phase — products reference gallery records, so the dependency order within the phase is gallery → products.
- Products self-publish (reactive takedown only) per owner decision; no approval queue.
- Delivered here as API scope (consumed by Phase 5's storefront): public catalogue query endpoints (browse, search, filter, sort, availability).
- Cross-tenant fixture suites (merchant A vs merchant B) start in this phase and remain the norm.

### Phase 3: Cart, Checkout, Payments & Orders
**Goal**: The purchase boundary is correct and safe: persistent authenticated carts, backend-authoritative totals, atomic inventory decrement, deterministic mock payment with honest unknown-outcome handling, and a backend-enforced order lifecycle with seller-scoped order operations
**Depends on**: Phase 2 (gallery + stores + catalogue must exist; checkout validates their data)
**Requirements**: CART-01, CART-02, CART-03, CART-04, CHCK-01, CHCK-02, CHCK-03, CHCK-04, CHCK-05, CHCK-06, CHCK-07, ORDR-05, CATL-08
**Success Criteria** (what must be TRUE):
  1. An authenticated customer's cart persists across browser sessions; items can be added, updated and removed; there are no guest carts; adding never reserves stock; the cart reflects current server-side prices and availability.
  2. Checkout derives totals entirely server-side (item totals + ₹40 flat shipping, free at ≥ ₹500, money stored as integer paise) and revalidates availability at the checkout boundary — unpublished or out-of-stock products cannot be purchased.
  3. Oversell is impossible: an atomic conditional stock decrement commits with the order, proven by concurrent-checkout tests (zero oversell under parallel attempts).
  4. The mock gateway reproduces four deterministic scenarios (success; known failure; success-but-response-lost; unavailable); an unknown outcome leaves the order PENDING_PAYMENT — visibly distinct from failure — and reconciles via the payment-inquiry endpoint over the attempt ledger; same-key retries reuse the original attempt (no double charge); confirmed failures mark PAYMENT_FAILED and restock; cancelling a PAID order before shipment records a simulated refund on the ledger.
  5. The order state machine (PENDING_PAYMENT → PAID → SHIPPED → DELIVERED, plus CANCELLED and PAYMENT_FAILED) is backend-enforced with invalid transitions rejected; merchants can view and manage only orders containing their store's items and can mark their orders shipped.
**Plans**: TBD (est. 4–5 plans: cart module; payments port + mock adapter + attempt ledger + inquiry; CheckoutService transaction (totals → decrement → order TX with purchase-time snapshots); order state machine + customer/seller/admin order endpoints + cancellation/refund/restock; race, idempotency and scenario-matrix test suites)

Notes:
- **Highest-risk phase** — the four commerce-correctness pitfalls (client-trusted totals, oversell race, non-idempotent retries, timeout-as-failure) are designed in here, not hardened later. Needs `--research-phase` per research flags.
- The `PaymentsGateway` port is defined so a real provider later is an adapter swap; the mock adapter is modeled as if external (own ledger, latency, inquiry).
- Delivered here as API scope (presented by Phase 5/6 UIs): customer order endpoints, seller order management, admin order views. The UI never displays client-submitted totals as authoritative.

### Phase 4: Admin Backend & Contract Freeze
**Goal**: Minimum platform administration is available over privileged APIs, and the frozen OpenAPI contract with a generated typed client becomes the backend→frontend handoff gate
**Depends on**: Phase 3 (admin endpoints orchestrate the finished domain services)
**Requirements**: ADMN-01, ADMN-02, ADMN-05, ADMN-06, OPS-02
**Success Criteria** (what must be TRUE):
  1. An admin can view and manage users and merchants/stores through privileged endpoints.
  2. An admin can view and manage order operations across all stores.
  3. Every admin endpoint requires the backend-enforced platform-admin role — non-admins are denied everywhere (role-matrix tests prove it; nothing is frontend-only).
  4. The complete OpenAPI contract is emitted as the single source of truth, the typed frontend client is generated from it, and the contract is frozen — CI fails on drift — closing the backend→frontend handoff gate.
**Plans**: TBD (est. 3–4 plans: admin module (users, merchants, orders) over domain services; admin authorization hardening + role-matrix suite; OpenAPI emission + client generation + drift CI job; backend test-suite completion + journey/contract walkthrough doc against the frozen contract)

Notes:
- Admin is thin orchestration over existing domain services — no parallel business logic.
- This phase's completion is the **handoff gate**: no substantial frontend work starts before the contract is frozen and the client generated.

### Phase 5: Customer Storefront
**Goal**: Customers can complete the entire buying journey through the storefront UI, built against the frozen contract and generated client
**Depends on**: Phase 4 (frozen OpenAPI contract + generated client)
**Requirements**: CATL-01, CATL-02, CATL-03, CATL-04, CATL-05, CATL-06, CATL-07, ORDR-01, ORDR-02, ORDR-03, ORDR-04, GALL-08, OPS-09
**Success Criteria** (what must be TRUE):
  1. A visitor can browse the public storefront, open product detail pages (description, all selected gallery images, price, merchant, availability), search by text, filter by the admin-managed category list, sort listings, and see current stock status.
  2. The storefront provides terms and privacy static placeholder pages.
  3. After successful payment the customer sees an order confirmation; they can view their order history and order details retaining purchase-time information (items, quantities, unit prices, merchant, totals, shipping) and can cancel any order until it ships.
  4. Products referencing a deactivated gallery image render a graceful placeholder for that image without breaking product pages, carts or orders.
  5. The checkout journey is complete in the UI: cart management, server-derived totals display, idempotent checkout submission, the mock payment path clearly labelled as simulation (collecting no real card data, never presenting simulated outcomes as real processing), and unknown payment outcomes shown distinctly from confirmed failures.
**Plans**: TBD (est. 4–5 plans: web app shell + Clerk wiring + generated client integration; catalogue/browse/PDP/search/filter/sort pages; cart + checkout UI with honest payment states; order confirmation/history/details/cancel; multi-image display + deactivated-image placeholder handling)
**UI hint**: yes

Notes:
- Builds only against the frozen contract via the generated client — no speculative endpoints; auth header injection follows the contract's bearer transport.
- Clerk sign-in UI (AUTH-01..03 presentation) is wired here; the identity subsystem was delivered in Phase 1.
- Cart and checkout UI present capabilities whose substance shipped in Phase 3 (CART-*/CHCK-*); this phase makes them observable to the customer.

### Phase 6: Seller & Admin Dashboards
**Goal**: Merchants and admins can run their side of the marketplace through dashboard UIs, built against the frozen contract and generated client
**Depends on**: Phase 4 (frozen contract); can proceed in parallel with Phase 5 once the gate passes
**Requirements**: GALL-06, GALL-07, MERC-06, MERC-07
**Success Criteria** (what must be TRUE):
  1. A signed-in customer can activate a store from the UI and manage their store profile, products (create/edit/publish/archive) and inventory from the merchant dashboard.
  2. A merchant can pick multiple product images from the admin-curated gallery via a picker filtered by category/tags/name — with no upload option and no arbitrary URL entry — and customers then see all selected images on the product page.
  3. A merchant can view and manage their store's orders from the dashboard — and only those orders — and mark orders shipped, with meaningful errors explaining disallowed actions.
  4. The admin console UI lets an admin manage users, merchants/stores, categories, gallery metadata and order operations; frontend route guards are UX only (the backend remains the security boundary).
**Plans**: TBD (est. 3–4 plans: merchant onboarding + store/product/inventory UI; gallery picker + multi-select flow; seller order management UI; admin console UI)
**UI hint**: yes

Notes:
- Gallery CRUD UI consumes the Phase 2 admin gallery API; the picker is merchant-facing per the gallery decision (no uploads, no arbitrary URLs).
- Seller order management UI consumes the Phase 3 seller order endpoints.

### Phase 7: Integration & E2E Journeys
**Goal**: The integrated system's important journeys are proven end-to-end by automated browser tests, with the full suite (unit, integration, API, E2E) green in CI
**Depends on**: Phase 5 and Phase 6 (both subsystems complete)
**Requirements**: OPS-04
**Success Criteria** (what must be TRUE):
  1. Playwright journeys cover the customer purchase loop end-to-end (browse → cart → checkout → confirmation → history) including all four mock-payment scenarios and the unknown-outcome retry path.
  2. Merchant and admin journeys are verified end-to-end: onboard → publish a product with gallery images → receive an order → mark shipped; admin manages users, merchants, categories and orders.
  3. Cross-role and cross-tenant negative journeys pass: merchant A cannot reach merchant B's orders/products through the UI; non-admins cannot use admin surfaces.
  4. The generated client regenerates from the frozen contract in CI with drift detection failing the build, and the full automated suite (Vitest, Supertest, React Testing Library, Playwright) is green in CI.
**Plans**: TBD (est. 3–4 plans: E2E harness (storage-state auth, per-worker fixtures); customer journey specs incl. payment scenario matrix; merchant/admin journey specs + negative cross-tenant specs; CI suite integration + drift job)

Notes:
- Backend phases each delivered their own tests; this phase adds the cross-subsystem journey layer — no new backend features here except fixes the journeys expose.

### Phase 8: Deployment & Release
**Goal**: The system is deployed under the zero-spend constraint with persistent data, a deployed smoke test, seeded demo content, documentation and a reviewer-friendly walkthrough
**Depends on**: Phase 7 (the integrated system is proven before it ships)
**Requirements**: OPS-06, OPS-07, OPS-08
**Success Criteria** (what must be TRUE):
  1. The app is deployed — frontend on Vercel (provider hostname), backend and persistent PostgreSQL on zero-spend providers — with the local Docker Compose demo fallback intact, and a deployed smoke test of the Clerk cross-origin token handoff passes.
  2. Seed/demo data loads the complete demo (including the ~200-image gallery seed) and a reviewer-friendly walkthrough guides the important application journeys.
  3. A Starlight documentation site covers setup, architecture, API behaviour and key decisions.
  4. A complete purchase journey works against the deployed environment with backend-enforced correctness intact (totals, inventory, ownership), documented with provider limits/cold-start/spend-boundary notes.
**Plans**: TBD (est. 3–4 plans: provider selection + deploy pipeline (Vercel + Neon + backend host per owner decision); deployed smoke test + DEPLOYMENT.md limits table; seed-as-runbook + reviewer walkthrough; Starlight docs site)

Notes:
- ⚠️ **Open owner decision (escalate at roadmap time, do not defer):** backend host. Research recommends Cloud Run free tier but it requires a card on file — conflicts with zero-spend unless the owner approves. Documented fallbacks: Railway trial for ephemeral demos + Docker Compose as the deployed reference. `DEPLOYMENT.md` stays provider-agnostic until decided.
- Neon CU-hour math (scale-to-zero, no keep-alive pings) and lazy inquiry-based payment reconciliation design belong here.

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 (∥ 6) → 7 → 8

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Platform Foundation & Identity | 1/9 | In Progress|  |
| 2. Gallery, Stores & Catalogue | 0/TBD | Not started | - |
| 3. Cart, Checkout, Payments & Orders | 0/TBD | Not started | - |
| 4. Admin Backend & Contract Freeze | 0/TBD | Not started | - |
| 5. Customer Storefront | 0/TBD | Not started | - |
| 6. Seller & Admin Dashboards | 0/TBD | Not started | - |
| 7. Integration & E2E Journeys | 0/TBD | Not started | - |
| 8. Deployment & Release | 0/TBD | Not started | - |

---

*Roadmap created: 2026-11-16 (Stage 1 only; Stage 2 = separate follow-on milestone)*
