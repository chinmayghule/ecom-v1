# Pitfalls Research

**Domain:** Marketplace-lite e-commerce (NestJS 12 + Next.js 16 + PostgreSQL + Clerk, zero-spend hosting, mock payments, mandated backend → frontend → integration → deployment sequence)
**Researched:** 2026-11-16
**Confidence:** HIGH for commerce-correctness patterns (long-established domain knowledge, reinforced by master-document constraints); MEDIUM for hosting-specific mechanics (Neon verified against current docs; backend host still unselected)

**Note on phase references:** GSD phases do not exist yet (roadmap is being created from this research). Pitfalls reference descriptive phase roles — `Foundation`, `Backend:Auth`, `Backend:Catalogue/Cart`, `Backend:Checkout/Payment`, `Backend:Orders/Merchant`, `Frontend`, `Integration`, `Deployment`, `Stage 2`. Substitute roadmap phase numbers when the roadmap lands. Stage 1 spans all of these; Stage 2 is a separate milestone.

---

## Critical Pitfalls

### Pitfall 1: Trusting client-submitted totals, prices or quantities at checkout

**What goes wrong:**
Checkout accepts a cart payload containing line prices, totals, shipping amounts or product IDs-and-quantities composed in the browser and processes payment against it. Even with no attacker, a stale cart (price changed since the item was added) silently charges the wrong amount. With an attacker, any price can be set to 0.

**Why it happens:**
The cart is naturally built client-side, so "send the cart to /checkout" is the path of least resistance. The backend treats the cart as input instead of recomputing it from source-of-truth rows.

**How to avoid:**
- Checkout takes only `{ productId, quantity }` pairs (+ optional cart identifier). Everything else is derived server-side inside one transaction: fetch product rows, verify each product is `published`, store is active, stock suffices, recompute unit prices, shipping (₹40 flat, free ≥ ₹500) and total in integer paise.
- The cart table stores only quantities — never a cached price that checkout could read back. The cart *display* may show prices, but checkout never trusts them.
- Compare against the catalog price at checkout and surface a "price changed, review your cart" response rather than silently charging the old or new price without telling the customer.
- Never accept a client-supplied `total`, `shippingAmount`, or `unitPrice` field in any request DTO — validation should reject unknown purchase-critical fields, not just ignore them.

**Warning signs:**
- Checkout request DTO contains fields named `total`, `amount`, `price`, or `shipping`.
- Any test that mutates the request body's total and expects the payment to change for the *wrong* amount (instead of the server recomputed amount).
- Cart add/edit responses include computed totals that later get re-sent to the server.

**Phase to address:** `Backend:Checkout/Payment` (DTO design at the start of the phase); add cross-check tests in `Integration`.

---

### Pitfall 2: Oversell race — read-stock-then-decrement without atomicity

**What goes wrong:**
The classic pattern `const p = await findProduct(); if (p.stock >= qty) await update({ stock: p.stock - qty })` is a check-then-act race. Two concurrent checkouts of the last unit both pass the check and both decrement → negative stock / oversold order. This project decided **no inventory reservation**: stock is validated at checkout, which makes the *atomic conditional decrement* the only safety net — there is no reservation layer hiding this bug.

**Why it happens:**
The two-step pattern works perfectly in single-user dev and in sequential tests. Races only appear under concurrency, and the project's Stage 2 (load testing) is exactly when they'd surface — too late.

**How to avoid:**
- Use a single atomic statement: `prisma.product.updateMany({ where: { id, published: true, stock: { gte: qty } }, data: { stock: { decrement: qty } } })` and treat `count === 0` as an out-of-stock failure that rolls back the transaction. This needs no locks and no serializable isolation.
- Perform the decrement **in the same transaction** that creates the order, so an out-of-stock failure never leaves an order row behind.
- Decide and document the failure ordering explicitly (see Pitfall 4): payment confirmation happens first, then decrement+order-creation in one transaction; if the decrement loses the race, the payment must be voided/refunded by the mock service and the attempt ledger records it — never leave money captured against no order.
- Load-test the checkout path with concurrent purchases of a single-stock product in Stage 2 — it is the cheapest high-value k6 scenario.

**Warning signs:**
- Any code path where `stock` is read into a variable before an update.
- Prisma `$transaction` interactive callbacks lasting longer than needed (holding locks), or checkout logic spread across multiple transactions.
- Integration test suite has no concurrent-checkout test.

**Phase to address:** `Backend:Checkout/Payment` (invariant designed into the checkout transaction); concurrency test in `Backend:Orders`/`Integration`; verified under load in Stage 2.

---

### Pitfall 3: Non-idempotent payment retries → double charges / duplicate orders

**What goes wrong:**
A user clicks "Pay" twice (double-click, retry after a spinner timeout, flaky network). Without idempotency, each request creates its own payment attempt and (if the mock says success) its own order — duplicate orders, double stock decrement, double charge. In a real system this is the most litigated e-commerce bug class.

**Why it happens:**
Retries feel like a frontend concern ("disable the button"), but the button cannot cover network-level retries, refreshes after a lost response, or browser back-and-resubmit.

**How to avoid:**
- Implement the decided design: an **idempotency key** generated per checkout submission; the backend stores it on the payment attempt ledger; a retry with the same key **reuses the original attempt** (returns its current outcome) rather than creating a new one. Different key → new attempt is legitimate (customer explicitly re-trying after a failure), but the order must be keyed so one order can't get two successful captures.
- Bind the idempotency key to a checkout draft/order-in-progress row created before the payment call; the payment attempt references it. One active in-progress checkout per cart.
- The deterministic mock must model the failure modes *through* this machinery: the `success-but-response-lost` scenario means the attempt is `CAPTURED` but the caller saw a timeout — the recovery path is the inquiry endpoint with the same key, not a fresh payment.
- Frontend: generate the key once per checkout attempt, reuse it on automatic retries, request a new key only after the user explicitly restarts from a *known-failed* state.

**Warning signs:**
- The mock payment service is called directly from the request handler with no persistence of the attempt before the call.
- No unique constraint on the attempt ledger's idempotency key.
- Tests only cover the happy path and the explicit-failure path, never "pay, lose the response, retry with same key".

**Phase to address:** `Backend:Checkout/Payment` (ledger + idempotency are core of this phase, not a hardening afterthought); deterministic-scenario tests in the same phase; e2e journey in `Integration`.

---

### Pitfall 4: Treating a timeout or lost response as a payment failure

**What goes wrong:**
Checkout wraps the payment call in a try/catch and, on timeout, marks the order `PAYMENT_FAILED`. But the payment may have actually succeeded — the mock's `success-but-response-lost` scenario exists precisely to demonstrate this. Result: the system records "failed" while money was captured, or frees stock for an order that was actually paid, or charges again on a retry.

**Why it happens:**
HTTP clients throw on timeout and the catch block is right there. Distinguishing *unknown* from *failed* requires deliberately modeling three outcomes instead of two.

**How to avoid:**
- Encode the invariant in the state machine: a timeout/transport error produces an **`UNKNOWN` (pending-inquiry)** attempt state, never a terminal failure. Only an explicit response from the mock service can settle it as success or known failure.
- Per the decided design: an attempt ledger + inquiry endpoint. On unknown, the backend (and UI) polls/queries the inquiry endpoint with the idempotency key; the ledger resolves the truth. The UI must show an honest "payment status unclear, checking…" state — never a failure message that isn't proven.
- The master document requires logs to distinguish unknown outcome from confirmed failure — make the Pino log level/fields differ (`outcome: 'unknown'` vs `outcome: 'failed'`) so a reviewer can verify this.
- Only resolve `UNKNOWN → failed` via inquiry (or a bounded reconciliation pass), never via elapsed time alone.

**Warning signs:**
- Any `catch` around the payment call that transitions an order directly to a terminal `PAYMENT_FAILED`.
- No `PENDING`/`UNKNOWN` state in the payment attempt enum.
- The mock's response-lost scenario is implemented by throwing an error rather than by succeeding internally and suppressing the response.

**Phase to address:** `Backend:Checkout/Payment` (state machine design); UI honest-state handling in `Frontend`; e2e scenario coverage in `Integration`.

---

### Pitfall 5: Orders missing purchase-time data (live-join onto mutable catalogue)

**What goes wrong:**
Order details render by joining live `product` rows. When the merchant later edits a price, renames, unpublishes or archives the product — or deletes the store's only category — historical orders display wrong prices, wrong names, or break entirely. The master document explicitly requires orders to "retain the purchase-time information needed to explain what was bought and at what price."

**How to avoid:**
- Snapshot at checkout inside the order transaction: per line item store `productName`, `unitPricePaise`, `quantity`, `lineTotalPaise`, plus `productId`, `storeId`, and merchant/store display name. Order totals and shipping stored on the order. Never recompute from the catalogue.
- Decide deletion semantics: products are archived (not hard-deleted) per scope, but enforce that in a migration-level or repository-level rule so no code path hard-deletes a product referenced by an order line (FK with `onDelete: Restrict` is the cheap guard).
- Customer deletion anonymizes the buyer but orders retain an anonymized reference (decided) — store the buyer snapshot (display name at purchase) on the order too, so anonymization doesn't blank out order history for merchants.

**Warning signs:**
- Order DTOs whose price fields are computed by joining `product` at read time.
- No denormalized name/price columns on order line tables.
- Account-deletion routine edits rows that order history depends on.

**Phase to address:** `Backend:Checkout/Payment` (schema shape) and `Backend:Orders` (read model); verify in `Integration` (archive a product, then view an old order).

---

### Pitfall 6: IDOR — merchant A reading or mutating merchant B's resources

**What goes wrong:**
Endpoints like `GET /orders/:id`, `PATCH /products/:id`, `GET /stores/:id/orders` check authentication but not ownership. Any signed-in user (or any merchant) can read/modify another merchant's products, inventory and orders by guessing or iterating IDs. In a multi-merchant marketplace this is the single most reputationally damaging bug class.

**Why it happens:**
Guards are built once for "is this a valid product?" during happy-path development; ownership is a second, orthogonal check that's easy to omit when the frontend only ever links the user to their own resources.

**How to avoid:**
- **Scope at the query, not after it.** Every merchant-facing query on a store-owned resource includes `where: { storeId: callerStoreId }` (and `where: { id, storeId }` for single-resource fetches). Fetch-then-check is a fallback, never the pattern. A 404 (not 403) for a foreign resource also avoids leaking existence.
- Resolve `caller → store` from the backend-owned local user/store tables on every request via a `StoreOwnershipGuard`-style NestJS guard; never trust a `storeId` from the request body, query, or header.
- Admin routes are a separate capability check — a merchant is not an admin, an admin is not implicitly a merchant for ownership purposes (admin may access all data by role, but should still go through the admin service layer).
- Test it mechanically: a dedicated cross-tenant fixture suite (two merchants, seeded) that asserts 404/403 for every foreign-resource endpoint — product CRUD, inventory, seller orders, store profile. This suite is cheap and catches regressions forever.
- Customer order endpoints scope by `userId` the same way (`where: { customerId: callerId }`).

**Warning signs:**
- Any merchant route handler that accepts an id and calls `prisma.product.findUnique({ where: { id } })` without a `storeId` in the where clause.
- Ownership checks living in the frontend (hiding the link to "My Products" but the API route is open).
- No two-merchant fixtures in the test suite.

**Phase to address:** `Backend:Auth` (guard pattern established once) and every backend module; cross-tenant test suite must exist by end of backend phases and re-run in `Integration`.

---

### Pitfall 7: Role confusion (customer / merchant / admin) and frontend-only guards

**What goes wrong:**
Two related failures: (a) Next.js middleware protects pages, but the NestJS API trusts requests because "only our frontend calls it" — anyone with curl reaches everything; (b) roles are inferred from Clerk metadata, org membership or `isMerchant` flags scattered ad hoc, so a customer can hit merchant endpoints or a merchant can hit admin endpoints by knowing the URL.

**Why it happens:**
Clerk provides authentication but, per the decided architecture, no application roles — the backend must own authorization, and that's extra work that happy-path development never exercises.

**How to avoid:**
- One NestJS `AuthGuard` verifies the Clerk JWT on *every* route (global guard, `@Public()` opt-out for storefront browsing) — do not sprinkle per-controller guards.
- One roles/capability guard driven by backend-owned role data (`role: CUSTOMER | MERCHANT | ADMIN` on the local user, store membership for merchant scope). Declarative `@RequireRoles(ADMIN)` decorators so route intent is auditable at a glance.
- Guard order matters: authentication guard registered first, then role guard, then resource-ownership resolution. Compose tests for each layer separately (401 vs 403 vs 404).
- Frontend route guards are UX only. State this in code review vocabulary: "frontend guard = redirect, backend guard = security."
- Admin bootstrap (decided: env-configured verified email list grants admin at first sign-in) — verify `email_verified` before granting; treat the list as config, log the promotion event; a matching-but-unverified email must never self-promote.

**Warning signs:**
- `@Public()`-by-default controllers with per-route auth checks (inverse of safe default).
- Role checks that read `auth().sessionClaims` for role info (Clerk session claims are not the app's role source here).
- Admin endpoints reachable with a merchant token in any test.

**Phase to address:** `Backend:Auth` establishes guard architecture; every backend module consumes it; role-matrix test suite (customer/merchant/admin × endpoint classes) in backend phases and `Integration`.

---

### Pitfall 8: Clerk token-verification mistakes in the NestJS backend

**What goes wrong:**
Several flavors, all verified against current Clerk docs:
- (a) The Next.js app "authenticates" and forwards a user id in a header/body — the backend trusts an unauthenticated identity claim (spoofable).
- (b) Backend verifies by calling the Clerk Backend API per request (fetching the user) instead of verifying the JWT — slow, rate-limit-exposed, and treats Clerk availability as an auth dependency on every request.
- (c) JWKS fetched per verification with no caching → added latency on every request; conversely, relying on deprecated options (`jwksCacheTtlInMs` is deprecated/no-op in current SDKs).
- (d) Clock-skew 401s: verifier clock drift (WSL2, Docker Desktop after sleep, CI runners, un-NTP'd free-tier VM) rejects freshly minted tokens (`nbf` in the future). Default tolerance is 5s; free-tier VM clocks drift more than that.
- (e) `authorizedParties` not set — the subdomain-cookie-leak protection Clerk documents — matters once frontend (Vercel hostname) and API are on different origins.

**How to avoid:**
- Backend verifies the Clerk-issued JWT itself. Prefer networkless verification with the PEM `jwtKey` (from Clerk dashboard → JWT public key) so auth has zero runtime dependency on Clerk's API and JWKS caching stops being a concern.
- Pin `clockSkewInMs` thoughtfully; add an ops runbook item: free-tier VM/container clock sync (NTP) is part of deployment, and "works locally, 401s in prod" is clock drift until proven otherwise (decode the token, compare `nbf`/`exp` to server time).
- Set `authorizedParties` to the Vercel frontend origin(s) once hosts are known.
- Keep the Clerk SDK version current in one place (a shared auth module) — Clerk SDKs move fast (e.g., `jwksCacheTtlInMs` deprecation) and two call sites drift.

**Warning signs:**
- Any code path that passes a user id from the request (header, body, query) into authorization logic without JWT verification.
- Auth latency that spikes when Clerk is degraded.
- 401 bursts right after deployment to a new host, or after laptop sleep in dev.

**Phase to address:** `Backend:Auth` (verification module + clock-skew runbook item), revisited in `Deployment` (host clock/NTP check).

---

### Pitfall 9: Clerk ↔ local user lifecycle drift (on-demand provisioning without webhooks)

**What goes wrong:**
The decided design provisions the local user on first verified sign-in and uses **no public webhook endpoint**. That is a valid trade-off, but it means: Clerk-side changes (display name update, email change, account deletion) never propagate. Consequences: stale display names, and a deleted-in-Clerk user whose local row keeps orders and may retain role data indefinitely. There's also the **provisioning race**: first sign-in fires multiple concurrent requests (Next.js may render several server components in parallel), each seeing "no local user" and each trying to insert → unique-constraint errors or duplicate rows.

**How to avoid:**
- Provision with an **upsert-on-conflict** idempotent routine (`INSERT ... ON CONFLICT (clerkId) DO UPDATE` / Prisma `upsert` on unique `clerkId`) called from a single memoized session-resolution point, not from every guard invocation. Prisma's `upsert` alone can still race under concurrency — rely on the DB unique constraint + catch the conflict, or use an interactive transaction with advisory lock if needed.
- Make sign-in-time sync cheap and self-healing: refresh display name/verified-email from the verified session claims on each sign-in (claims are trustworthy post-verification); don't call Clerk Backend API per request for this.
- Document the accepted drift (per master document: deletion anonymizes profile, orders retained). Add a lightweight admin view flag for local users with no recent valid session so drift is observable rather than invisible.
- Never let the local `role` be writable from session claims — roles are backend-owned and only change via bootstrap logic or admin action.

**Warning signs:**
- Provisioning code in a guard called on every request (perf + race surface).
- `clerkId` not unique-indexed in the schema.
- Any code path that assumes Clerk metadata equals local role state.

**Phase to address:** `Backend:Auth` (schema + provisioning routine + uniqueness); account-deletion flow in `Backend:Orders`/user phase; drift observability in `Deployment`.

---

### Pitfall 10: Prisma transaction and connection-pool failure modes on free-tier Postgres

**What goes wrong:**
Multiple stack-specific traps:
- (a) **Interactive transaction timeouts**: Prisma's `$transaction(async tx => …)` defaults to `maxWait: 2000ms` / `timeout: 5000ms`. Checkout does several reads + conditional decrement + order insert; on a cold free-tier compute (hundreds of ms just to wake) plus Clerk-verified latency, 5s is realistic to exceed. The transaction throws, but a partially-written sequence (if writes escaped the transaction) is corruption.
- (b) **Connection exhaustion**: a long-lived NestJS server is fine with one PrismaClient, but each *deployment instance*, migration job, seed script and test runner opens its own pool. Free tiers are small: Neon's smallest compute allows 105 direct connections; Prisma Postgres free allows 10 pooled.
- (c) **Transaction-mode pooler surprises**: Neon/Prisma Postgres poolers use PgBouncer in transaction mode — session-level `SET`, advisory locks, `LISTEN/NOTIFY`, temp tables don't survive transaction boundaries. Code that leans on those "works locally, fails deployed."
- (d) **Migrations through the pooler** produce lock/session-state errors; `prisma migrate` needs the direct (non-pooled) URL, which free tiers give as a separate env var (`DIRECT_URL`).
- (e) **Shadow database**: `prisma migrate dev` needs a shadow DB; on a hosted free tier that means provisioning a second tiny database (or using a local Docker Postgres for shadowing) — a CI surprise.

**How to avoid:**
- One global PrismaClient instance (NestJS `PrismaService`, global module, `onModuleInit` connect) — never `new PrismaClient()` per request/tenant.
- Set explicit `maxWait`/`timeout` on checkout transactions; keep transactions short (no Clerk/network calls inside a transaction — resolve auth first, then open the transaction).
- Two connection strings from day one: `DATABASE_URL` (pooled, app) and `DIRECT_URL` (migrations, CLI); document which scripts use which. If the pooler breaks something subtle, test against direct locally before assuming a code bug.
- All writes go through explicit transactions with the repository pattern; unit-test the invariant "failed checkout leaves no partial state" with a deliberately failing step.
- Migration discipline: `prisma migrate dev` locally (never `db push` against shared/hosted DBs), `prisma migrate deploy` in CI/CD; migrations are append-only files reviewed in PRs.

**Warning signs:**
- `Transaction API error` / `pool timeout` appearing intermittently in deployed logs.
- More than one place instantiates PrismaClient.
- `db push` used anywhere outside throwaway local sandboxes.
- CI failing on migrations with shadow-DB errors.

**Phase to address:** `Foundation` (PrismaService, connection strings, migration workflow) — this is a foundation-level decision; revisited in `Deployment` and Stage 2 (pool sizing evidence).

---

### Pitfall 11: Zero-spend hosting traps: free-tier suspension, cold starts and quota math

**What goes wrong:**
- (a) **Neon CU-hour exhaustion**: free tier = 100 CU-hours/project/month. An always-on 0.25 CU compute ≈ 400 h/month — i.e., a continuously-running backend that keeps Postgres warm will exhaust the allowance in ~2–3 weeks, then the compute **suspends until next month** (data safe, app down). This is a mid-month outage trap, not a theoretical one.
- (b) **Scale-to-zero cold starts**: after 5 min idle, first query takes hundreds of ms (worse after long idle) — checkout latency spikes, health checks time out, uptime monitors can mark the app down, Playwright e2e flakiness against the deployed env.
- (c) **Egress/transfer caps**: 5 GB/month public network transfer per project on Neon free; image-heavy storefronts proxying through the API, or chatty polling (payment status inquiry loops), burn it silently.
- (d) **Better Stack over-quota**: published over-quota log ingestion is billable; the master document permits integration **only** with a verified zero-spend cap. The naive default of "send everything to Better Stack" violates the zero-spend constraint the moment log volume ramps.
- (e) **Sleeping app server**: whatever host runs NestJS (unselected — do not assume Render) will likely sleep/scale-to-zero on a free tier; the first request after sleep fails or takes 30–60 s, and any *scheduled* work (reconciliation of unknown payments) won't run on a sleeping host.

**How to avoid:**
- Do the quota math in the `Deployment` phase plan before choosing: expected idle vs active minutes × CU size vs 100 CU-hours. Prefer a design where the DB scales to zero when the app does (no heartbeat polling that keeps Postgres permanently awake — every "keep-alive ping" burns CU-hours and is effectively a workaround for suspension, not a fix).
- Reconciliation of unknown payment attempts must survive host sleep: run it lazily on inquiry request rather than as a background timer, or via a CI cron action that's cost-free.
- Configure Better Stack only after verifying an ingestion cap/zero-spend boundary; otherwise stay local-Pino (the master document explicitly endorses this fallback).
- Add a reviewer-facing "the app may take N seconds to wake" note; keep the demo/seed path resilient to cold starts (retry once on first request).
- Track spend boundaries in a single `DEPLOYMENT.md` (limits table per provider) so a later provider change re-checks terms — the zero-spend constraint is binding.

**Warning signs:**
- Uptime monitor pinging more often than the app earns traffic (keep-alive smell).
- Health checks failing at "random" times late in the month (CU-hour exhaustion).
- A background interval timer in the deployed backend.

**Phase to address:** `Deployment` (provider selection + quota math + cron/sleep design); Stage 2 (load tests must account for cold starts or they'll measure wake-up latency, not the app).

---

### Pitfall 12: OpenAPI/client-generation drift between API and frontend

**What goes wrong:**
Three hand-maintained copies of the truth: NestJS DTOs (validation), OpenAPI annotations, and hand-written frontend types/callers. They drift the moment someone edits a DTO without regenerating. The mandated backend-first sequence makes this worse, not better: frontend work starts *after* the API exists, so stale assumptions get baked in silently, and `Integration` is the first time mismatch is noticed.

**Why it happens:**
OpenAPI decorators in Nest are optional-looking; generated clients feel like ceremony when the API is small.

**How to avoid:**
- Treat the OpenAPI document as the **source of truth from the first backend module**: `@nestjs/swagger` derives it from the same DTO classes that validation uses — this collapses the two copies into one. Enforce "every route documented or CI fails."
- Generate the frontend API client in CI (`openapi-typescript`/`openapi-fetch` or orval) as a build step, committed or generated-but-typechecked — never hand-written. Typecheck failures on regeneration = the drift detector.
- Backend planning must model customer and merchant journeys (mandated) — write the journey flows against the OpenAPI contract *before* implementing, so contracts serve real consumers instead of reflecting internal entity shapes.
- Add a CI job: regenerate client → typecheck frontend → fail on diff (if committing generated code) or fail on typecheck error. This is the cheapest integration-phase insurance available.

**Warning signs:**
- Frontend code contains literal `fetch('/api/...')` calls with inline types or `any` responses.
- Swagger annotations duplicating validation rules that DTOs already express.
- The word "temporarily out of sync" appearing in PR descriptions.

**Phase to address:** `Foundation` (pipeline setup) and enforced from the first backend module through `Integration`.

---

### Pitfall 13: Cross-origin session handoff between Next.js and the NestJS API

**What goes wrong:**
Clerk's session lives in a cookie scoped to the frontend's domain (Vercel hostname). The API is a separate origin. Developers assume the backend can "read the Clerk cookie" — it can't across origins. Result: either auth works only via server-side proxying (which hides the API contract), or the team discovers in `Integration` that no token ever reaches NestJS.

**Why it happens:**
Local dev often runs everything on one port/proxy, so the cross-origin reality is invisible until deployment.

**How to avoid:**
- Decide the token transport early and write it into the contract: frontend calls `auth()`/`getToken()` in a Next.js server action or client hook and sends `Authorization: Bearer <session JWT>` to the API; NestJS verifies with the shared PEM key (Pitfall 8). This keeps the API genuinely independent (Stage 4 mobile client will consume it the same way).
- Set `authorizedParties` (Pitfall 8) once both origins are known.
- CORS: explicit allowlist (Vercel origin + localhost dev origins), credentials policy consistent with the bearer-header approach (bearer tokens avoid cookie CORS pain entirely — prefer them).
- Add an early smoke test: a deployed-backend endpoint the deployed-frontend can call with a real session — do not defer this to the end of `Integration`.

**Warning signs:**
- Any design doc mentioning "cookies shared between apps."
- CORS configured as `origin: true` or `*` during dev and forgotten.
- The API contract has no auth scheme documented in OpenAPI (securitySchemes).

**Phase to address:** `Backend:Auth` (contract decision) → `Frontend` (client plumbing) → `Integration` (deployed smoke test) — this is the single most likely "discovered too late" item in the mandated sequence.

---

### Pitfall 14: Playwright e2e flakiness and nondeterministic payment-scenario testing

**What goes wrong:**
- Auth flows in e2e are the flakiest part of any suite; driving Clerk's hosted sign-in UI on every test multiplies flake and runtime.
- Parallel workers share one seeded database → cart/stock/checkout tests interfere (the same fixture product's stock decremented by another worker mid-test).
- Mock payment scenarios triggered by "special test data" (magic emails/card numbers) leak into demo journeys or get asserted with sleeps (`waitForTimeout`) around the unknown-outcome polling — inherently flaky.
- Free-tier cold starts (Pitfall 11) make deployed-env e2e runs intermittently fail on the first navigation.

**How to avoid:**
- **Storage-state auth**: sign in once per worker via Clerk's supported programmatic approach (test-mode instance, programmatic sign-up/session token injection per Clerk's testing guidance) and reuse `storageState` — do not click through hosted UI per test.
- Deterministic scenario switching in the mock: scenario selected by explicit request field/header (e.g., a documented `x-demo-payment-scenario` on the mock checkout endpoint, or a designated scenario-selector in the payment form) — same mechanism doubles as the reviewer demo feature the master document asks for. One mechanism for demos and tests keeps them honest.
- Per-worker test data: seed unique fixtures per worker (separate merchant/store/products per worker), or run API-level (Supertest) coverage for concurrency and reserve Playwright for the few journey tests; never share mutable stock between workers.
- Poll with `expect.poll`/web-first assertions against the *backend state* (order status via API) rather than UI sleeps; the unknown-outcome scenario's polling loop is deterministic because the inquiry endpoint resolves deterministically from the ledger.
- e2e against the deployed env: add an explicit warm-up/retry-once step, and document cold-start expectation.

**Warning signs:**
- `waitForTimeout` anywhere in the suite.
- Tests pass locally, fail in CI with no code change (classic shared-state or cold-start signature).
- Auth performed via UI typing in more than one test file.

**Phase to address:** `Foundation` (test harness patterns) and `Backend:Checkout/Payment` (deterministic scenario design serves both tests and demo); e2e suite authored in `Integration`.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Cart stores cached unit prices (for display speed) | Cheaper cart page | Checkout must ignore them anyway; two price sources to reconcile | Never for checkout logic; acceptable if clearly display-only and re-derived per render |
| Ownership checked after fetch (`if (order.storeId !== caller)` in service) | Faster to write than scoped queries | One missed service = IDOR; invisible in code review | Only as a documented fallback pattern with a lint/test convention; prefer scoped queries |
| `db push` during prototyping, "we'll write migrations later" | Speed in week 1 | No migration history = no reproducible deploy; retrofitting is painful | Only in throwaway local sandboxes, never against a shared or hosted DB |
| Hand-written frontend API types | Skip generation setup once | Silent drift; integration-phase rework | Never — generation is a one-time foundation cost |
| Treating payment timeout as failure "temporarily" | Simpler state machine now | Violates a binding master-document constraint; rework in same phase | Never — this is a specified requirement, not an optimization |
| Login-gated everything (auth before storefront browsing) | Skips `@Public()` design | Worse demo UX; forces e2e through auth for public pages | Never for the storefront; auth-only is fine for cart/checkout/merchant/admin |
| Keep-alive pings to prevent Postgres suspension | App "never cold" | Burns CU-hours, hides the real quota, may exhaust allowance mid-month | Never — design for sleep instead |
| Storing money as float/decimal-from-string with `toFixed` | Familiar arithmetic | Rounding drift vs integer-paise decision; test flakiness on cents | Never — decision already made: integer paise |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Clerk (NestJS) | Verifying identity by calling Backend API per request; trusting forwarded ids; no `authorizedParties` | Verify JWT networklessly with PEM key; set `authorizedParties`; cache/one auth module |
| Clerk (sign-in sync) | Webhook-style event handling assumptions; per-request provisioning | On-demand upsert keyed on unique `clerkId`, memoized once per sign-in; unique DB constraint as race backstop |
| Clerk (clock) | Debugging 401s as config bugs | Check host clock/NTP first; decode token and compare `nbf`/`exp` (5s default skew) |
| Neon/Prisma (pooling) | One URL for everything; app traffic over direct URL | Pooled `DATABASE_URL` for app, `DIRECT_URL` for migrations/CLI; explicit `connect_timeout`/`pool_timeout` for wake-ups |
| PgBouncer transaction mode | Session `SET`, advisory locks, temp tables in app code | Keep such needs out of app runtime, or use direct connections deliberately |
| Vercel ↔ NestJS | Assuming shared cookies; CORS `*` in prod | Bearer-token transport in the contract; explicit origin allowlist |
| Better Stack | Ingesting all logs by default; assuming free tier is uncapped | Verify zero-spend cap first; otherwise local Pino only (master document fallback) |
| Mock payment | Scenario switching via magic real-world data; ledger optional | Explicit scenario parameter on the mock endpoint; attempt ledger + inquiry endpoint are the mechanism, not an add-on |
| GitHub Actions | Free-minutes assumptions with Playwright + Docker | Keep e2e count modest; use `--workers` tuned to runner cores; cache Playwright browsers |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Per-request `new PrismaClient()` | Slow requests; "too many connections" | Global PrismaService singleton | Immediately under any concurrency |
| N+1 in catalogue/order lists (product→store, order→lines) | Page latency grows with list size | `include`/`select` batching; Stage 2 exists to measure this | ~tens of items per page — visible in Stage 2 |
| Interactive transactions wrapping network calls (Clerk lookups inside tx) | Pool exhaustion, 5s timeout failures | Resolve auth/external calls first; open tx only around DB writes | Under concurrent checkout load |
| Unindexed `storeId`/`customerId` foreign keys on merchant/customer lists | Slow seller order lists | Indexes on every ownership column at schema time | ~thousands of orders (Stage 2 seed scale) |
| Keep-alive heartbeat to hosted Postgres | Quota burn, masked cold-start reality | Design for scale-to-zero; warm-up step in demo path | Weeks into deployment (quota exhaustion) |
| Storing money as float | Off-by-one-paise totals, flaky tests | Integer paise arithmetic everywhere (already decided) | First non-trivial total (immediately, sometimes) |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Trusting `storeId`/`userId` from request input | Full cross-tenant access (IDOR) | Derive caller identity/ownership only from verified JWT + backend tables |
| Unverified email grants admin (bootstrap list) | Anyone claiming the email self-promotes | Require `email_verified` from Clerk session; log promotions |
| Mock payment endpoint left unauthenticated/public in prod | Anyone can "pay" any order / corrupt demo data | Mock payment routes are authenticated checkout routes like real ones; scenario parameter requires owning the order |
| External image URLs rendered as-is | XSS via `javascript:` URLs, injection via markup | Validate scheme (https) + extension/content-type at ingest; render via `<img src>` only, never raw markup |
| Verbose 403s revealing resource existence | Enumeration aid | 404 for foreign resources; uniform error shape |
| Logging tokens/card-like data in Pino | Credential leakage in logs | Redaction rules from day one; never log auth headers or payment payloads verbatim |
| Frontend-hidden admin routes as "security" | Admin API exposed | Backend role guard on every admin route; frontend hiding is UX only |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Unknown payment outcome shown as "failed" | Customer believes charge failed; may re-pay (in real life) | Honest "verifying payment…" state; inquiry-driven resolution |
| Stale cart after price/stock change silently charges new amounts | Trust damage | Re-validate at checkout; show explicit "your cart changed" review step |
| Cold-start 30s blank page on first visit after idle | Looks broken to reviewers | Skeleton + expectation note; single warm-up retry |
| Merchant can't see *why* an order action is blocked | Support burden, confusion | Backend-enforced transitions return meaningful error messages (e.g., "order already shipped") |
| Demo data gone after free-tier suspension/restore | Reviewer lands on empty app | Seed script is part of deployment runbook; reviewer journey doc |

## "Looks Done But Isn't" Checklist

- [ ] **Checkout:** Often missing concurrent-decrement test and same-key retry test — verify both exist and pass.
- [ ] **Payment:** Often missing the response-lost scenario resolving via inquiry (not a new attempt) — verify ledger shows one capture per key.
- [ ] **Orders:** Often missing purchase-time snapshot — verify old orders render correctly after archiving a product and editing a price.
- [ ] **Authorization:** Often missing cross-tenant fixture suite — verify merchant B gets 404/403 on merchant A's product/inventory/order for every route class.
- [ ] **Roles:** Often missing role-matrix tests (customer×merchant×admin × endpoint classes) — verify merchant token fails admin route and vice versa.
- [ ] **Auth:** Often missing deployed-env smoke test of token handoff (Next.js → NestJS) — verify a real session reaches the deployed API with 200, before the integration phase ends.
- [ ] **Migrations:** Often missing `migrate deploy` run in CI against the hosted DB — verify pipeline applies schema, not `db push`.
- [ ] **Observability:** Often missing distinction between unknown and failed payment outcomes in logs — verify Pino fields differ in the response-lost scenario.
- [ ] **Deployment:** Often missing quota-math doc and suspension behaviour check — verify `DEPLOYMENT.md` states limits, cold-start expectation and spend boundaries per provider.
- [ ] **OpenAPI:** Often missing CI regeneration+typecheck of the frontend client — verify the job exists and fails on drift.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Client-trusted totals shipped | LOW | Add server-side recomputation + DTO narrowing; audit existing orders for wrong amounts; recompute-era tests |
| Oversell occurred | MEDIUM | Reconcile negative stock manually; compensate affected orders; replace read-then-write with conditional decrement (localized change if the pattern is contained) |
| Double charge/duplicate orders (mock) | MEDIUM | Deduplicate by idempotency key retroactively; add unique constraints; restore stock; note in demo docs |
| IDOR found post-launch | LOW (mock/demo data) but reputationally HIGH | Fix query scoping; run full cross-tenant suite; audit access logs for foreign access |
| Lifecycle drift bite (stale/deleted Clerk users) | LOW | Add sign-in reconciliation pass; admin cleanup view; document accepted drift |
| CU-hour exhaustion mid-month | MEDIUM | App down until window resets (or upgrade with approval); reduce CU footprint, remove keep-alives; re-do quota math |
| Migration history lost/mismatched | HIGH | Re-baseline: `migrate diff` against hosted schema, generate baseline migration, freeze `db push` use — painful, avoid by discipline |
| Client drift discovered in integration | LOW | CI regeneration job + typecheck; fix mislabeled DTOs; contracts retro-fitted per module |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Client-trusted totals (1) | Backend:Checkout/Payment | Negative test: tampered total in request → server-derived amount unchanged |
| Oversell race (2) | Backend:Checkout/Payment | Concurrent same-stock checkout test → exactly one succeeds |
| Double-charge retries (3) | Backend:Checkout/Payment | Same-key retry after success returns original attempt; ledger unique constraint test |
| Timeout ≠ failure (4) | Backend:Checkout/Payment | Response-lost scenario: attempt resolves via inquiry, log fields distinguish unknown/failed |
| Missing purchase-time data (5) | Backend:Checkout/Payment + Orders | Archive product + edit price → historical order unchanged |
| IDOR / ownership (6) | Backend:Auth + all backend modules | Cross-tenant fixture suite green |
| Role confusion (7) | Backend:Auth | Role-matrix test suite green; admin grant requires verified email |
| Clerk verification (8) | Backend:Auth | JWT verified networklessly in unit test; 401-burst clock-skew runbook item exists |
| Lifecycle drift (9) | Backend:Auth | Unique `clerkId` + concurrent first-sign-in test; deletion anonymization test |
| Prisma/pool traps (10) | Foundation | One PrismaClient (code check); explicit tx timeouts; pooled/direct URLs wired; CI `migrate deploy` |
| Hosting quota/sleep (11) | Deployment | Quota-math doc; no keep-alive timers; cold-start expectations documented |
| OpenAPI drift (12) | Foundation → Integration | CI regenerates client + typechecks; journey flows written against contract |
| Cross-origin auth handoff (13) | Backend:Auth contract, Integration | Deployed frontend → deployed API authorized smoke test |
| e2e flakiness (14) | Foundation + Checkout/Payment + Integration | No `waitForTimeout`; per-worker fixtures; storage-state auth; deterministic scenario parameter |

## Sources

- Clerk `verifyToken`/`authenticateRequest` reference (clock skew 5s default, `jwtKey` networkless verification, `authorizedParties`, deprecated `jwksCacheTtlInMs`): clerk.com/docs/reference/backend/verify-token, /authenticate-request — HIGH
- Clerk clock-skew error behaviour and diagnosis (community + SDK error strings + PR #1428 raising default 2s→5s): github.com/clerkinc/javascript — MEDIUM/HIGH
- Neon free plan limits (100 CU-hours, 5 GB transfer, 1 GB storage, scale-to-zero 5 min, suspension-on-quota behaviour, PgBouncer transaction mode, direct-vs-pooled URLs): neon.com/pricing, /docs/connect/connection-pooling, /faqs/free-plan-limits-and-quotas — HIGH
- Prisma on Neon/Prisma Postgres (pooled vs direct connection strings, transaction-mode pooler limitations, tx `maxWait`/`timeout`, shadow-DB needs, connection-exhaustion patterns): prisma.io/docs (v6 Neon guide, Prisma Postgres connection pooling) — HIGH
- Next.js 16 caching model (fetch uncached by default, `cacheComponents` replacing `dynamic`/`revalidate`/`fetchCache` segment configs): nextjs.org/docs caching guides — HIGH
- Project decisions shaping pitfalls: `/home/paradox/projects/ecom-v1/master-document.md` (§2 commerce boundaries, §5 engineering principles), `.planning/PROJECT.md` (Key Decisions: no reservation + atomic decrement, idempotency key + inquiry ledger, env-email admin bootstrap, on-demand provisioning without webhooks, integer paise) — HIGH (authoritative for this project)
- Commerce-correctness patterns (idempotency keys, snapshot-on-order, check-then-act races): established payments/e-commerce engineering practice — HIGH (domain consensus, corroborated by master-document explicit constraints)

---
*Pitfalls research for: marketplace-lite e-commerce — NestJS/Next.js/PostgreSQL/Clerk, zero-spend, mock payments*
*Researched: 2026-11-16*
