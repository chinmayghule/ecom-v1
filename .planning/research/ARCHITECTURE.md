# Architecture Research

**Domain:** Marketplace-lite e-commerce — modular monolith (NestJS API + Next.js web + PostgreSQL)
**Researched:** 2026-11-16
**Confidence:** HIGH (structure grounded in master-document constraints + owner decisions in `.planning/PROJECT.md`; external integration patterns verified against current docs — see Sources)

## Standard Architecture

### System Overview

Three deployable pieces exactly as the master document mandates: one Next.js web app, one NestJS API, one PostgreSQL database. The mock payment gateway is an **in-process module** that models an external provider's interface (submit + inquiry + deterministic scenarios) but has no network boundary in Stage 1.

```
┌────────────────────────────────────────────────────────────────────┐
│                         Clerk (external IdP)                        │
│        sign-up / sign-in UI, session tokens, no app roles           │
└───────────────┬────────────────────────────────────────────────────┘
                │ session token (Bearer / __session)
┌───────────────▼──────────────────────┐   ┌──────────────────────────┐
│  apps/web — Next.js 16               │   │ OpenAPI contract         │
│  storefront · cart · checkout ·      │───┼──► openapi.json          │
│  orders · seller dashboard · admin   │   │    (source of truth)     │
│  (rendering + Clerk UI only)         │   │    generated client      │
└───────────────┬──────────────────────┘   └──────────┬───────────────┘
                │ HTTPS, typed fetch client           │ drives generation
┌───────────────▼─────────────────────────────────────▼───────────────┐
│                     apps/api — NestJS 12 (modular monolith)          │
│                                                                      │
│  ┌──────────┐ ┌──────────┐ ┌───────────┐ ┌──────┐ ┌──────────────┐  │
│  │ identity │ │ stores   │ │ catalogue │ │ cart │ │ orders       │  │
│  │ users,   │ │ merchant │ │ products, │ │ cart,│ │ checkout     │  │
│  │ roles,   │ │ onboard, │ │ catego-   │ │ items│ │ orchestration│  │
│  │ provi-   │ │ profile  │ │ ries,     │ │      │ │ order state  │  │
│  │ sioning  │ │          │ │ products, │ │      │ │ machine,     │  │
│  │          │ │          │ │ inventory │ │      │ │ items        │  │
│  └────┬─────┘ └────┬─────┘ └────┬──────┘ └──┬───┘ └──────┬───────┘  │
│       │            │            │            │            │          │
│  ┌────▼────────────▼────────────▼────────────▼────────────▼───────┐  │
│  │              shared domain services (transactional)             │  │
│  └────────────────────────────────┬────────────────────────────────┘  │
│  ┌────────────┐  ┌────────────┐   │   ┌──────────┐  ┌─────────────┐  │
│  │ payments   │  │ admin      │◄──┘   │ common:  │  │ health,     │  │
│  │ mock gate- │  │ (cross-    │       │ Clerk    │  │ Pino logs,  │  │
│  │ way port,  │  │ cutting    │       │ guard,   │  │ OpenAPI     │  │
│  │ attempts   │  │ oversight) │       │ authz,   │  │ Swagger     │  │
│  │ ledger,    │  └────────────┘       │ money,   │  └─────────────┘  │
│  │ inquiry    │                       │ filters  │                   │
│  └────────────┘                       └──────────┘                   │
└───────────────────────────────┬──────────────────────────────────────┘
                                │ Prisma / SQL
                    ┌───────────▼───────────┐
                    │    PostgreSQL (1 DB)  │
                    └───────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| `identity` | Local user records, Clerk→local provisioning on first verified sign-in, admin bootstrap via env email list, role/capability resolution, account deletion with anonymization | Nest module + Prisma `users` table; `@clerk/backend` `verifyToken()` in a global guard |
| `stores` | Merchant onboarding (self-service, no approval), store profile management, store↔owner binding — the root of merchant ownership | `stores` table keyed by `owner_user_id`; authorization via ownership checks |
| `catalogue` | Admin-managed categories, merchant product CRUD (draft/published/archived), external image URL validation, product inventory (stock on product), public browse/search/sort/filter | `categories`, `products` tables; `stock_quantity` lives on `products`; atomic conditional decrement exposed as a narrow service |
| `cart` | One persistent authenticated cart per customer, cart items, re-pricing at read time (never stored) | `carts` (unique per user), `cart_items` referencing products |
| `orders` | Checkout orchestration (the purchase boundary), order + order-item persistence with purchase-time snapshots, order state machine (PENDING_PAYMENT→PAID→SHIPPED→DELIVERED, CANCELLED, PAYMENT_FAILED), customer/seller/admin order views and allowed actions | `orders`, `order_items` tables; transactional `CheckoutService`; state transitions enforced in service layer |
| `payments` | Mock gateway behind a port interface: payment-attempt ledger, idempotency keys, inquiry endpoint, deterministic scenario injection, unknown-outcome reconciliation | `payment_attempts` table; module models an external provider (never trusts cross-transaction state) |
| `admin` | Minimum platform oversight: users, merchants/stores, category configuration, order operations — reuses other modules' services | Thin controllers calling domain services with `isAdmin` authorization |
| `common` | Cross-cutting: Clerk auth guard + decorators, role/ownership authorization helpers, global validation/exception filters, money utilities (integer paise), Prisma service, Pino setup | Shared Nest providers, no domain logic |

### Ownership model (merchant ↔ store ↔ product ↔ order)

Ownership is a single chain enforced server-side at every mutation:

```
users (id) ──owns──> stores (owner_user_id) ──owns──> products (store_id)
                                                        │
orders (buyer_user_id) ──> order_items (store_id, product_id snapshot)
```

- **Merchant authorization** = "does `products.store_id → stores.owner_user_id` point at the authenticated local user?" Applied on every product/inventory mutation and every seller order query.
- **`order_items` denormalizes `store_id`** so seller-facing order lists are a direct indexed lookup (`WHERE store_id = ?`) without joining through products — a product can be archived/edited/deleted without breaking merchant order history.
- **Order items snapshot purchase-time data** (`product_title`, `unit_price_paise`, quantity, line total) per the master document's "orders retain purchase-time information" requirement; later price edits never rewrite history.
- **One order spans multiple merchants** (marketplace-lite: a customer cart can contain items from several stores). Seller order management filters by `order_items.store_id`. This is the one place the domain is genuinely marketplace-shaped; do not "simplify" into per-merchant orders.

## Recommended Project Structure

```
ecom-v1/                          # monorepo (npm/pnpm workspaces per STACK.md)
├── apps/
│   ├── api/                      # NestJS 12
│   │   └── src/
│   │       ├── main.ts
│   │       ├── app.module.ts
│   │       ├── common/           # Clerk guard, authz decorators, filters,
│   │       │                     # money utils, Prisma service, Pino config
│   │       ├── health/
│   │       └── modules/
│   │           ├── identity/     # module.ts, controller, service, dto/, *.spec.ts
│   │           ├── stores/
│   │           ├── catalogue/
│   │           ├── cart/
│   │           ├── orders/       # includes CheckoutService + state machine
│   │           ├── payments/     # gateway port + mock adapter + ledger
│   │           └── admin/
│   └── web/                      # Next.js 16 (App Router)
│       └── src/
│           ├── app/
│           │   ├── (storefront)/ # browse, product detail, cart, checkout, orders
│           │   ├── seller/       # onboarding, store, products, orders
│           │   └── admin/        # minimal oversight console
│           ├── lib/api/          # generated client wrapper (auth header injection)
│           └── components/
├── packages/
│   └── api-client/               # GENERATED from apps/api openapi.json — never hand-edited
└── docs/                         # Starlight site
```

### Structure Rationale

- **`apps/api/src/modules/<domain>/`**: one Nest module per business capability, each self-contained (module, controllers, services, DTOs, specs). This is the modular-monolith contract: boundaries are enforced by Nest module imports only — a module may import another's exposed service, never reach into its internals.
- **No `checkout` module**: checkout is a *flow*, not a domain. It lives as `CheckoutService` inside `orders`, which already depends on cart, catalogue and payments. A separate module would just re-orchestrate the same dependencies.
- **`packages/api-client/` is generated artefact, not source**: Nest's `@nestjs/swagger` emits `openapi.json`; `openapi-typescript` (+ `openapi-fetch`, ~6 kB runtime) generates types and a thin typed fetch client. Regenerate on every API change; the frontend never hand-writes an endpoint. (Orval is the alternative if TanStack Query hooks are wanted later — decision for planning, not architecture.)
- **`common/` holds no domain rules**: ownership checks live in the owning module (e.g. catalogue validates product ownership), `common` only supplies the primitives (current local user, role decorators).

## Architectural Patterns

### Pattern 1: Clerk token verification → local identity resolution (guard + provision)

**What:** Every API request carries a Clerk session token. A global Nest guard verifies it *networklessly* with `@clerk/backend`'s `verifyToken()` (JWK-cached), extracts `sub` (Clerk user ID) + verified email, resolves or provisions the local user, and attaches it to the request context. Application roles and ownership are read from the **local** row only.
**When to use:** Always — this is the only auth path in Stage 1 (no public webhook endpoint; provisioning on first sign-in per owner decision).
**Trade-offs:** Networkless verification is fast and outage-tolerant, but the local user can lag Clerk (e.g. deleted Clerk account still holds a valid token until expiry). Acceptable: sessions are short-lived; deletion/anonymization is triggered by the user's own authenticated action.
**Key detail:** there is **no official Clerk NestJS SDK** (MEDIUM confidence — community guides all use `@clerk/backend` directly; re-verify at phase time). Build a thin `ClerkAuthGuard` rather than adopting an unofficial wrapper.

```typescript
// common/clerk-auth.guard.ts (sketch)
async canActivate(ctx: ExecutionContext): Promise<boolean> {
  const token = extractBearerOrSessionCookie(req);
  const claims = await verifyToken(token, {
    secretKey: process.env.CLERK_SECRET_KEY, // or jwtKey
    authorizedParties: [config.webOrigin],
  });
  const user = await this.identityService.resolveOrProvision({
    clerkId: claims.sub, email: claims.email, emailVerified: claims.verifications,
  }); // provisions on first sign-in; grants ADMIN if email ∈ ADMIN_EMAILS
  req.currentUser = user;
  return true;
}
```

### Pattern 2: Atomic conditional stock decrement (oversell protection)

**What:** Stock is validated and decremented in one SQL statement inside the checkout transaction. No reservation, no pre-check-then-write race.
**When to use:** At checkout only — the cart never reserves inventory (owner decision).
**Trade-offs:** Under contention a customer may get a 409 "insufficient stock at checkout" after seeing the item available — correct and acceptable; the alternative (reservations) is explicitly out of scope.

```sql
UPDATE products
SET stock_quantity = stock_quantity - :qty, updated_at = now()
WHERE id = :productId
  AND status = 'PUBLISHED'
  AND stock_quantity >= :qty;
-- zero rows updated ⇒ item sold out/changed since cart read ⇒ abort with 409
```

If the checkout transaction rolls back for any reason, the decrement rolls back with it — no compensating logic needed pre-payment. Restocking happens only as a compensating action for post-commit payment failure (see Data Flow).

### Pattern 3: Payment attempt ledger with idempotency + inquiry (unknown-outcome safety)

**What:** The mock gateway is treated exactly like a real external provider that can return success, known failure, or *no definitive answer* (timeout / lost response). Every charge creates a `payment_attempts` row keyed by a client-supplied idempotency key (unique constraint). A retry with the same key **never re-charges**: the ledger is consulted, and if the attempt is `UNKNOWN`, the gateway's inquiry endpoint (by `gateway_ref`) is queried to resolve the true outcome.
**When to use:** Every checkout charge and every retry of an unresolved order.
**Trade-offs:** One extra table and one extra state — this is the minimum structure that makes "payment succeeded but response lost" honest and repeatable, which the master document explicitly requires.

```
payment_attempts.status: INITIATED → SUCCEEDED
                                   → FAILED
                                   → UNKNOWN ──inquiry──► SUCCEEDED | FAILED
order.status:             PENDING_PAYMENT → PAID | PAYMENT_FAILED
                          (stays PENDING_PAYMENT while attempt is UNKNOWN;
                           restock only after confirmed FAILED)
```

The mock adapter exposes four deterministic scenarios (success, known failure, lost-response/unknown, gateway unavailable) selected via a test/demo control (header or seeded flag) — never random. Even though the gateway is in-process, the `orders` module interacts with it only through the `PaymentsGateway` port and never assumes shared transaction state.

### Pattern 4: Server-derived totals (backend authority at the purchase boundary)

**What:** Checkout computes items subtotal from **database prices**, applies flat shipping (₹40; free ≥ ₹500 = 50000 paise), and stores the breakdown on the order. Browser-submitted prices/quantities/totals are never trusted; the cart is only an *intent* list (product id + quantity).
**When to use:** Checkout exclusively. Cart views may *display* prices read from products for UX, but they are not authoritative.
**Trade-offs:** None — this is a correctness invariant, not a preference.

## Data Flow

### Checkout / purchase boundary (the critical flow)

```
Customer (Next.js, authed)            NestJS                                 
──────────────────────────            ─────────────────────────────────────
1. POST /checkout                     │
   body: { idempotencyKey }           │ 2. Guard: Clerk token → local user   
   (UUID generated client-side,       │ 3. Load cart + items JOIN products   
    kept per checkout attempt)        │    (must be PUBLISHED, store active) 
                                      │ 4. TX: derive subtotal from DB       
                                      │    prices; shipping 40₹ / free ≥500₹ 
                                      │ 5. TX: atomic decrement per item     
                                      │    (Pattern 2) — 0 rows ⇒ 409, no     
                                      │    order created, no side effects    
                                      │ 6. TX: create order PENDING_PAYMENT  
                                      │    + order_items (price/title/       
                                      │    store_id snapshots); commit       
                                      │ 7. Create payment_attempt            
                                      │    (idempotency_key UNIQUE)          
                                      │ 8. Call PaymentsGateway.charge(...)  
        ◄─────────────────────────────┤    via port; scenario is            
   outcome + order status              │    deterministic (demo control)      
                                      │
   ┌──────────────────────────────────┼───────────────────────────────────┐
   │ Gateway returns SUCCEEDED        │ 9. attempt=SUCCEEDED, order=PAID   │
   │ Gateway returns FAILED           │ 9. attempt=FAILED, order=          │
   │                                  │    PAYMENT_FAILED; TX restocks     │
   │                                  │    (+qty) and marks items failed   │
   │ Gateway timeout / lost response  │ 9. attempt=UNKNOWN, order stays    │
   │                                  │    PENDING_PAYMENT; NO restock     │
   │                                  │    (money may have moved!)         │
   │ Gateway unavailable              │ 9. attempt=INITIATED, order stays  │
   │                                  │    PENDING_PAYMENT; retryable      │
   └──────────────────────────────────┴───────────────────────────────────┘
```

**Unknown-outcome reconciliation (idempotent retry + inquiry):**

```
Customer retries checkout with SAME idempotencyKey
    → PaymentsService: lookup attempt by key (UNIQUE)
        ├─ attempt SUCCEEDED → idempotent response: order PAID, no re-charge
        ├─ attempt FAILED    → idempotent response: PAYMENT_FAILED, may retry
        │                      with a NEW key
        └─ attempt UNKNOWN   → gateway.inquiry(gateway_ref)
               ├─ resolved SUCCEEDED → attempt=SUCCEEDED, order=PAID
               ├─ resolved FAILED    → attempt=FAILED, order=PAYMENT_FAILED,
               │                        restock
               └─ still unresolved   → order stays PENDING_PAYMENT; surfaced to
                                        customer ("payment being confirmed")
                                        and admin; optional periodic sweep
                                        re-runs inquiry for stale UNKNOWNs
```

Direction rule: **stock decrement commits *before* the charge is attempted; outcome writes happen *after*.** Never attempt payment inside the same transaction as order creation — that is what makes unknown outcomes possible and survivable.

### Other key flows

1. **First sign-in:** Clerk session → guard verifies → no local user for `clerk_id` → provision row (+ admin role if email matches env list) → if display name missing, prompt profile completion before other actions.
2. **Merchant activation:** authed customer POSTs store onboarding → `stores` row created → user now has merchant capability via store ownership (no separate "merchant role" mutation needed).
3. **Seller order management:** GET seller orders → `order_items WHERE store_id IN (user's stores)` → merchant marks SHIPPED (only while order is PAID) → backend enforces transition rules.
4. **Cancellation:** customer/admin cancel until SHIPPED; backend transitions to CANCELLED and restocks (compensating decrement in a transaction).
5. **Account deletion:** anonymize `users` row (clerk_id nulled, name/email replaced), orders retained with anonymized buyer reference for merchant/admin integrity.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Clerk | Next.js `@clerk/nextjs` for sign-in UI + session; API verifies tokens with `@clerk/backend` `verifyToken()` in a Nest guard | No official NestJS SDK (MEDIUM confidence, re-verify at phase time) — thin custom guard; no webhooks in Stage 1 |
| Mock payment gateway | In-process Nest module behind a `PaymentsGateway` port interface | Modeled as if external: own latency, scenario injection, inquiry endpoint; swapping a real provider later = new adapter, zero order-module changes |
| Better Stack (conditional) | Pino → hosted transport, uptime heartbeats | Only if verified zero-spend cap; local Pino satisfies requirement otherwise — architectural impact is nil (transport-only) |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| orders ↔ catalogue | Synchronous service calls (CheckoutService → InventoryService/ProductQueryService) | Catalogue owns stock rules; orders never writes `products.stock_quantity` directly except via the exposed atomic-decrement method |
| orders ↔ payments | Port interface (`PaymentsGateway`) + ledger service | Strict boundary — this is where Stage 3 decomposition would naturally cut; keep it clean |
| orders ↔ cart | Read-only consumption | Cart is input; checkout never mutates the cart (clear-on-success is a cart-module service call at most) |
| admin ↔ all domains | Service calls with admin authorization | Admin is an orchestration surface, not a second source of domain rules |
| web ↔ api | Generated typed client over HTTPS | The **only** frontend↔backend channel; no direct DB access, no server actions bypassing the API |

## Suggested Build Order (backend → frontend → integration → deployment)

Dependency-ordered so the backend becomes a coherent, tested subsystem before frontend starts. Each step is testable with Vitest + Supertest against the API alone.

```
Phase group A — Backend foundation (no commerce logic yet)
  1. Monorepo scaffold, Docker Compose (Postgres), Prisma/migrations,
     config, Pino logging, health endpoint, global validation/filters
  2. identity module: Clerk guard, resolve-or-provision, admin bootstrap,
     profile completion, account deletion/anonymization     [Supertest]

Phase group B — Catalogue and merchants
  3. stores module: self-service onboarding, store profile    [Supertest]
  4. catalogue: admin categories; merchant product CRUD +
     publish/archive; stock management; public browse/search  [Supertest]

Phase group C — Commerce core
  5. cart module: one cart per user, items CRUD               [Supertest]
  6. payments module: gateway port + mock adapter, attempt
     ledger, idempotency, inquiry, 4 deterministic scenarios  [unit-heavy]
  7. orders module: CheckoutService (totals → decrement →
     order TX → charge), state machine, reconciliation on
     idempotent retry, customer/seller/admin order endpoints,
     cancellation + restock                                   [Supertest]

Phase group D — Contract freeze + seed
  8. Admin cross-cutting endpoints; seed/demo data; full API
     test suite green; openapi.json emitted & committed

Phase group E — Frontend (builds only against frozen contract)
  9. Generate api-client; storefront/browse/product pages; auth +
     profile; cart; checkout UI with idempotency key; order history
  10. Seller dashboard (onboarding, products, inventory, orders)
  11. Admin console (minimal)

Phase group F — Integration + deployment
  12. Playwright end-to-end journeys — including all four payment
      scenarios and the unknown-outcome retry path
  13. CI/CD (GitHub Actions), hosting (Vercel + researched zero-spend
      backend/DB), Starlight docs, reviewer walkthrough
```

**Ordering rationale:**
- `identity` precedes everything: every module's authorization depends on local users and role resolution.
- `stores` before `catalogue`: products are FK-bound to stores and ownership checks resolve through stores.
- `payments` before `orders` *finalization*: orders should be built against the `PaymentsGateway` port — define the port + a fake when starting orders (step 7) if the real mock adapter lags; both must be complete before phase group D.
- `admin` last on the backend: it reuses finished domain services, so it's thin.
- The **OpenAPI contract freeze** (end of group D) is the backend→frontend handoff gate: the frontend is planned and built entirely against generated client types, per the master document.
- Group C is the highest-risk sequence — checkout/inventory/payment concurrency rules deserve the deepest phase-level research and test coverage (state-machine tables, race tests on decrement, scenario-matrix tests).

## Scaling Considerations

Deliberately minimal — the master document forbids speculative scaling; Stage 2 (hardening) owns performance work.

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 0–1k users (Stage 1) | Nothing. Single DB, single API instance, straightforward indexes on hot paths (products status/category/price, order_items.store_id, payment_attempts.idempotency_key) |
| Stage 2 workload | Evidence-led only: kill N+1s in catalogue/order listing, tune indexes + connection pool, measure with k6 before/after. No architectural change expected |
| Beyond | Out of scope; the payments port and module boundaries are the natural decomposition seams if Stage 3 is ever chosen |

### Scaling Priorities (recorded for Stage 2, not Stage 1)

1. **First bottleneck:** N+1 product/order listing queries and missing composite indexes.
2. **Second bottleneck:** connection-pool pressure during checkout transactions (keep checkout transactions short — do only writes, derive totals from already-fetched rows).

## Anti-Patterns

### Anti-Pattern 1: Trusting the browser for money

**What people do:** Accept cart totals, prices or shipping from the client, or display client-computed totals as authoritative.
**Why it's wrong:** Violates the backend-authority constraint; prices change between cart-add and checkout.
**Do this instead:** Cart = intent (product id + qty). Server derives every purchase-critical number inside the checkout transaction.

### Anti-Pattern 2: Reserving stock in the cart

**What people do:** Decrement stock on add-to-cart or hold "soft reservations" with expiry jobs.
**Why it's wrong:** Explicitly excluded by owner decision; adds a reservation lifecycle, timers and cleanup complexity for a portfolio-scale app.
**Do this instead:** Validate + atomically decrement at checkout only; communicate "availability confirmed at checkout" in UX.

### Anti-Pattern 3: Treating a payment timeout as a failure

**What people do:** Wrap the gateway call in try/catch; any error → mark PAYMENT_FAILED and restock.
**Why it's wrong:** The money may have moved — the master document explicitly forbids interpreting timeout/lost response as failure.
**Do this instead:** Attempt ledger + UNKNOWN state + inquiry + idempotent retry (Pattern 3). Restock only on *confirmed* failure.

### Anti-Pattern 4: Recharging on retry without idempotency

**What people do:** "Retry checkout" creates a fresh payment attempt every time.
**Why it's wrong:** Double-charging (in a real gateway) and duplicate stock decrements.
**Do this instead:** Client-generated idempotency key per checkout attempt, unique on `payment_attempts`; same-key retry reuses the original attempt.

### Anti-Pattern 5: Depending on Clerk webhooks for identity

**What people do:** Build a public webhook endpoint to sync Clerk users into local tables, making webhooks the identity backbone.
**Why it's wrong:** Overrides the owner decision (provision on first sign-in); adds a public endpoint, signature verification and event-replay concerns to Stage 1.
**Do this instead:** Resolve-or-provision inside the auth guard; handle deletion as the user-initiated anonymize flow.

### Anti-Pattern 6: Payment calls inside the order transaction

**What people do:** One big transaction: create order + decrement + call gateway + set PAID.
**Why it's wrong:** A gateway call inside a DB transaction holds locks/connections during external latency and makes the unknown-outcome state incoherent.
**Do this instead:** Transaction ends before the charge (Pattern 2's flow); outcome writes are a second short transaction.

### Anti-Pattern 7: Microservices leakage

**What people do:** Per-domain databases, message brokers, event sourcing, an API gateway "to be ready for Stage 3".
**Why it's wrong:** Master document forbids distributed infrastructure without a justified optional-stage objective; it multiplies Stage 1 failure surface.
**Do this instead:** One Nest process, one database, synchronous in-process calls; keep only the `PaymentsGateway` port and clean module boundaries as future decomposition seams.

### Anti-Pattern 8: Rewritable order history

**What people do:** Order items reference live products and read current price/title at display time.
**Why it's wrong:** Price edits/archival rewrite history; seller queries break; violates the purchase-time-snapshot requirement.
**Do this instead:** Snapshot `product_title`, `unit_price_paise`, `store_id` into `order_items` at purchase.

## Sources

- `master-document.md` (authoritative brief) — architecture constraints, staging, backend-first sequencing (HIGH)
- `.planning/PROJECT.md` Key Decisions — checkout, inventory, payment, lifecycle decisions (HIGH)
- Clerk docs — `verifyToken()` networkless session verification, token sources (`__session` cookie / `Authorization: Bearer`): https://clerk.com/docs/reference/backend/verify-token (HIGH)
- No official Clerk NestJS SDK found in current Clerk docs/changelog; community integrations use `@clerk/backend` directly: stackoverflow.com/questions/79606337, dev.to guides (MEDIUM — re-verify during backend foundation phase)
- OpenAPI client generation: `openapi-typescript` + `openapi-fetch` (types-only, ~6 kB) vs Orval (hooks/axios) — current comparison, buildwithfern.com guide (Sept 2026), orval.dev/docs (MEDIUM–HIGH)
- Atomic conditional decrement and idempotent payment ledgers: standard e-commerce engineering practice (well-established; no single authoritative doc — HIGH confidence from domain consensus)

---
*Architecture research for: marketplace-lite e-commerce (modular monolith)*
*Researched: 2026-11-16*
