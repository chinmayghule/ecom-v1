# Requirements: ecom-v1 (Stage 1 — Complete Monolith)

**Defined:** 2026-11-16
**Core Value:** A customer can buy a merchant's product through a safe, backend-enforced checkout (authoritative totals, validated inventory, deterministic mock payment with honest unknown-outcome handling), and the order is correctly visible and actionable to the right merchant — with ownership and authorization enforced server-side throughout.

**Scope note:** This roadmap covers Stage 1 only. Stage 2 (Hardened Monolith) is planned as a follow-on milestone after Stage 1 ships.

## v1 Requirements

### Identity & Accounts

- [ ] **AUTH-01**: Visitor can register through Clerk with email and a required display name
- [ ] **AUTH-02**: User can sign in and remain signed in across browser sessions
- [ ] **AUTH-03**: User can sign out from the application
- [ ] **AUTH-04**: First sign-in provisions a local application user from the verified Clerk identity (no webhooks)
- [ ] **AUTH-05**: A verified Clerk email matching the admin env-configured list grants the platform-admin role on first sign-in
- [ ] **AUTH-06**: User can delete their account; personal profile data is anonymized while order records are retained with an anonymized buyer reference

### Storefront & Catalogue

- [ ] **CATL-01**: Visitor can browse the public storefront of published products
- [ ] **CATL-02**: Visitor can view a product detail page (description, images, price, merchant, availability)
- [ ] **CATL-03**: Visitor can search products by text (basic match; fuzzy deferred)
- [ ] **CATL-04**: Visitor can filter products by category (admin-managed category list)
- [ ] **CATL-05**: Visitor can sort product listings (e.g. price, newest)
- [ ] **CATL-06**: Visitor can see current availability/stock status on product pages and listings
- [ ] **CATL-07**: Storefront provides terms and privacy static placeholder pages
- [ ] **CATL-08**: Unpublished or out-of-stock products cannot be purchased — availability revalidated at the checkout boundary

### Cart

- [ ] **CART-01**: Authenticated customer can add a product to their cart (no guest carts)
- [ ] **CART-02**: Customer can update quantities and remove items from the cart
- [ ] **CART-03**: Cart persists across browser sessions
- [ ] **CART-04**: Cart reflects current server-side prices and availability; stale items are flagged at checkout (adding to cart never reserves stock)

### Checkout & Payment

- [ ] **CHCK-01**: Backend derives order totals from server-side data (item totals + flat ₹40 shipping, free at ≥ ₹500; money stored as integer paise) — browser-submitted values are never trusted
- [ ] **CHCK-02**: Checkout revalidates stock and price at order placement and prevents oversell via an atomic conditional stock decrement committed with the order
- [ ] **CHCK-03**: Payment runs through a deterministic mock gateway supporting four repeatable scenarios: success; known failure; success-but-response-lost; service unavailable
- [ ] **CHCK-04**: An unknown payment outcome (timeout/lost response) leaves the order PENDING_PAYMENT — visibly distinct from a confirmed failure — and is reconciled via a payment-inquiry endpoint over the attempt ledger
- [ ] **CHCK-05**: Retrying checkout with the same idempotency key reuses the original payment attempt (no double charge)
- [ ] **CHCK-06**: A confirmed payment failure marks the order PAYMENT_FAILED and restocks the items
- [ ] **CHCK-07**: Cancelling a PAID order before shipment records a simulated refund on the payment attempt ledger

### Orders

- [ ] **ORDR-01**: Customer sees an order confirmation after successful payment
- [ ] **ORDR-02**: Customer can view their order history
- [ ] **ORDR-03**: Customer can view order details retaining purchase-time information (items, quantities, unit prices, merchant, totals, shipping)
- [ ] **ORDR-04**: Customer can cancel an order until it is shipped
- [ ] **ORDR-05**: The order state machine (PENDING_PAYMENT → PAID → SHIPPED → DELIVERED, plus CANCELLED and PAYMENT_FAILED) is backend-enforced; invalid transitions are rejected

### Image Gallery

- [ ] **GALL-01**: Admin can add gallery images by submitting validated external free-stock-image URLs with name, category and tags
- [ ] **GALL-02**: Admin can edit gallery image metadata (name, category, tags, URL)
- [ ] **GALL-03**: Admin can delete a gallery image — deletion soft-deactivates it (hidden from the picker, record retained)
- [ ] **GALL-04**: Admin can view and filter the gallery by category, tags and name from the admin dashboard
- [ ] **GALL-05**: The gallery is seeded with ~200 curated free stock image URLs covering common product types (e.g. shirts, trousers, skirts, smartphones)
- [ ] **GALL-06**: Merchant picks product images from the admin-curated gallery (filtered by category/tags/name); only gallery URLs are allowed — no merchant uploads or arbitrary external URLs
- [ ] **GALL-07**: Merchant can select multiple gallery images per product; customers see all of them on the product page
- [ ] **GALL-08**: Products referencing a deactivated gallery image render gracefully (placeholder for that image) without breaking product pages, carts or orders

### Merchant

- [ ] **MERC-01**: A signed-in customer can self-onboard as a merchant (activate their store) without manual approval
- [ ] **MERC-02**: Merchant can view and edit their store profile
- [ ] **MERC-03**: Merchant can create and edit simple products with images selected from the admin-curated gallery (GALL-06)
- [ ] **MERC-04**: Merchant can publish and archive their products
- [ ] **MERC-05**: Merchant can manage inventory (stock levels) for their own products
- [ ] **MERC-06**: Merchant can view and manage orders containing their store's items — and only those orders
- [ ] **MERC-07**: Merchant can mark their orders shipped
- [ ] **MERC-08**: A merchant cannot access or modify another merchant's resources — ownership enforced server-side on every endpoint

### Platform Administration

- [ ] **ADMN-01**: Admin can view users and manage accounts
- [ ] **ADMN-02**: Admin can view merchants/stores and manage them
- [ ] **ADMN-03**: Admin manages the category configuration (the single source of product categories)
- [ ] **ADMN-04**: Admin can reactively take down (unpublish) merchant products
- [ ] **ADMN-05**: Admin can view and manage order operations across all stores
- [ ] **ADMN-06**: Admin actions are privileged and distinguishable from customer/merchant actions (backend-enforced role, never frontend-only)

### Platform & Delivery

- [ ] **OPS-01**: Every API endpoint enforces server-side input validation, authorization and resource ownership (frontend guards are not a security boundary)
- [ ] **OPS-02**: API contract is OpenAPI (single source of truth); the frontend consumes a generated API client
- [ ] **OPS-03**: Pino structured application logging and health endpoints provide useful local/demo operational visibility
- [ ] **OPS-04**: Automated tests cover important business rules, API behaviour and end-to-end journeys (Vitest, Supertest, React Testing Library, Playwright)
- [ ] **OPS-05**: Local development uses Docker/Docker Compose; a repeatable CI/CD pipeline runs on GitHub Actions (free-tier safe)
- [ ] **OPS-06**: Frontend (Vercel, provider hostname) and backend are deployed with persistent PostgreSQL under the zero-spend constraint, with a local/demo fallback
- [ ] **OPS-07**: Seed/demo data (including the ~200-image gallery seed, GALL-05) and a reviewer-friendly walkthrough of the important application journeys exist
- [ ] **OPS-08**: A Starlight documentation site covers setup, architecture, API behaviour and key decisions
- [ ] **OPS-09**: The mock payment path is clearly labelled as simulation, never collects/stores/logs real card data, and never presents simulated outcomes as real processing

## v2 Requirements

Deferred to a future release. Tracked but not in the current roadmap.

### Notifications

- **NOTF-01**: Customer receives order-confirmation email
- **NOTF-02**: Customer receives shipped/delivered email notifications
- **NOTF-03**: Notification preferences

### Discovery

- **DISC-01**: Fuzzy/typo-tolerant product search (deferred, not abandoned — per master document)
- **DISC-02**: Guest checkout with cart merging (excluded from initial release; revisit later)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Real payment processing / any real card data | Forbidden by master document; mock gateway is deterministic and never represents simulation as real processing |
| Product variants / configurable products | Keep the product model simple for Stage 1 |
| Merchant image uploads / image-storage platform | Validated external image URLs only |
| Manual merchant approval queue | Onboarding is self-service by owner decision |
| Product reviews & ratings | **Deferred to a later stage/milestone — will eventually be mandatory** (owner decision 2026-11-16); trust signals need transaction volume the Stage 1 demo lacks |
| Merchant-uploaded images / arbitrary external product URLs | Images come only from the admin-curated gallery (owner decision 2026-11-16); uploads excluded from Stage 1 |
| Transactional email notifications | Deferred to v2 (owner decision 2026-11-16); avoids new external dependency, keeps zero-spend simple |
| Storybook | Deferred; not a Stage 1 requirement |
| Microservices, message brokers, Kubernetes, extra deployment layers | Practical monolith first; only with a justified optional-stage objective (Stages 3–5) |
| Enterprise admin / moderation / trust-and-safety platform | Minimum admin capability only, per master document |
| Better Stack hosted observability | Conditional: only if a verified zero-spend cap is possible; otherwise local Pino observability satisfies the requirement |
| Mobile client | Stage 4 (optional), not this milestone |
| Stage 2 load testing / hardening | Separate follow-on milestone; measured on the working Stage 1 system |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUTH-01 | Phase 1 | Pending |
| AUTH-02 | Phase 1 | Pending |
| AUTH-03 | Phase 1 | Pending |
| AUTH-04 | Phase 1 | Pending |
| AUTH-05 | Phase 1 | Pending |
| AUTH-06 | Phase 1 | Pending |
| CATL-01 | Phase 5 | Pending |
| CATL-02 | Phase 5 | Pending |
| CATL-03 | Phase 5 | Pending |
| CATL-04 | Phase 5 | Pending |
| CATL-05 | Phase 5 | Pending |
| CATL-06 | Phase 5 | Pending |
| CATL-07 | Phase 5 | Pending |
| CATL-08 | Phase 3 | Pending |
| CART-01 | Phase 3 | Pending |
| CART-02 | Phase 3 | Pending |
| CART-03 | Phase 3 | Pending |
| CART-04 | Phase 3 | Pending |
| CHCK-01 | Phase 3 | Pending |
| CHCK-02 | Phase 3 | Pending |
| CHCK-03 | Phase 3 | Pending |
| CHCK-04 | Phase 3 | Pending |
| CHCK-05 | Phase 3 | Pending |
| CHCK-06 | Phase 3 | Pending |
| CHCK-07 | Phase 3 | Pending |
| ORDR-01 | Phase 5 | Pending |
| ORDR-02 | Phase 5 | Pending |
| ORDR-03 | Phase 5 | Pending |
| ORDR-04 | Phase 5 | Pending |
| ORDR-05 | Phase 3 | Pending |
| GALL-01 | Phase 2 | Pending |
| GALL-02 | Phase 2 | Pending |
| GALL-03 | Phase 2 | Pending |
| GALL-04 | Phase 2 | Pending |
| GALL-05 | Phase 2 | Pending |
| GALL-06 | Phase 6 | Pending |
| GALL-07 | Phase 6 | Pending |
| GALL-08 | Phase 5 | Pending |
| MERC-01 | Phase 2 | Pending |
| MERC-02 | Phase 2 | Pending |
| MERC-03 | Phase 2 | Pending |
| MERC-04 | Phase 2 | Pending |
| MERC-05 | Phase 2 | Pending |
| MERC-06 | Phase 6 | Pending |
| MERC-07 | Phase 6 | Pending |
| MERC-08 | Phase 2 | Pending |
| ADMN-01 | Phase 4 | Pending |
| ADMN-02 | Phase 4 | Pending |
| ADMN-03 | Phase 2 | Pending |
| ADMN-04 | Phase 2 | Pending |
| ADMN-05 | Phase 4 | Pending |
| ADMN-06 | Phase 4 | Pending |
| OPS-01 | Phase 1 | Pending |
| OPS-02 | Phase 4 | Pending |
| OPS-03 | Phase 1 | Pending |
| OPS-04 | Phase 7 | Pending |
| OPS-05 | Phase 1 | Pending |
| OPS-06 | Phase 8 | Pending |
| OPS-07 | Phase 8 | Pending |
| OPS-08 | Phase 8 | Pending |
| OPS-09 | Phase 5 | Pending |

**Mapping convention:** each requirement maps to the phase delivering the majority of its substance (backend-enforced rules → backend phase; presentation-facing requirements → frontend phase). Backend APIs consumed by later UI phases are noted in the corresponding phase details in ROADMAP.md.

**Coverage:**
- v1 requirements: 61 total
- Mapped to phases: 61 ✓
- Unmapped: 0 ✓

---
*Requirements defined: 2026-11-16*
*Last updated: 2026-11-16 — traceability populated after roadmap creation (8 phases; Stage 1 scope; gaps resolved with owner)*
