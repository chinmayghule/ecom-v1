# Feature Research

**Domain:** Marketplace-lite e-commerce (three-sided: customers, self-service merchants, minimum platform admin)
**Researched:** 2026-11-16
**Confidence:** HIGH (domain knowledge is stable and corroborated by multiple 2026 industry sources)

> **Purpose of this document:** VALIDATE the agreed v1 scope (master-document.md §2 + PROJECT.md Key Decisions) against standard e-commerce/marketplace expectations — **not** to expand scope. Master-document rule: *"No silent scope expansion."* Genuine table-stakes gaps are flagged as **"GAP — owner review"** items only.

---

## Scope Validation: Agreed v1 vs Table Stakes

The agreed v1 capability set is **coherent and covers the core transaction loop** that every source identifies as the MVP test: supply (merchant onboarding → catalogue → inventory) meets demand (discovery → cart → checkout → order) with platform control (admin oversight, backend-enforced authorization). This matches the consensus "prove one transaction end-to-end" marketplace MVP definition (Appfyl 2026-05/07, Easify 2026-10, Cubix, Sharetribe).

| Standard table stake | Agreed v1 coverage | Verdict |
|---|---|---|
| Buyer registration/auth | Clerk + required display name | ✅ Covered |
| Public catalogue + search/sort/filter | Basic search, sort, filter (admin-managed categories) | ✅ Covered |
| Listing/product detail page | Product details in scope | ✅ Covered |
| Persistent cart | Authenticated persistent cart | ✅ Covered (guest carts deliberately excluded — see Deviations) |
| Checkout with trustworthy totals | Backend-derived totals (items + ₹40 flat shipping, free ≥ ₹500, INR/paise) | ✅ Covered, stronger than typical (backend authority explicit) |
| Payment | Deterministic mock payment with 4 repeatable scenarios incl. unknown-outcome handling | ✅ Covered (deliberate mock — see Anti-Features) |
| Order confirmation + history + status | Order confirmation, history, details; lifecycle PENDING_PAYMENT → PAID → SHIPPED → DELIVERED / CANCELLED / PAYMENT_FAILED | ✅ Covered |
| Seller onboarding | Self-service, no approval queue | ✅ Covered (deliberate deviation from "moderation queue" pattern — see Deviations) |
| Seller listing management | Create/edit/publish/archive; images via validated external URLs | ✅ Covered |
| Seller inventory management | Basic inventory for own products; atomic conditional decrement prevents oversell | ✅ Covered |
| Seller order management | Consolidated seller-facing order view, backend-enforced permissions | ✅ Covered |
| Admin panel (users, listings, transactions) | Minimum admin: users, merchants, categories, order operations | ✅ Covered at "minimum" level by explicit design |
| Stock re-check at order creation | Validated at checkout; cart never reserves | ✅ Covered — matches PlanSmith checklist item 9 exactly |
| Idempotent payment confirmation | Idempotency key + inquiry endpoint over attempt ledger | ✅ Covered — matches PlanSmith item 6 ("repeated confirmation never creates a second charge") |
| Server-side authorization | Application-owned authz in NestJS; ownership enforcement | ✅ Covered |

**Conclusion:** The agreed v1 scope is a coherent, defensible marketplace-lite MVP. Every major role's core loop is present. The gaps below are peripheral trust/communication features, not structural omissions.

---

## Feature Landscape

### Table Stakes (Users Expect These)

Mapped against the agreed v1 scope. "In scope" = already agreed; "GAP" = genuinely missing from agreed scope, flagged for owner review.

| Feature | Why Expected | Complexity | In agreed v1? | Notes |
|---------|--------------|------------|-------|-------|
| Account registration/sign-in | Cannot transact without identity | MEDIUM | ✅ In scope | Clerk; display name required; local user provisioned on first sign-in |
| Catalogue browsing + category navigation | Users leave if they can't find products | LOW | ✅ In scope | Admin-managed category list, one category per product (owner decision) |
| Keyword search, sorting, filtering | Search users are highest-intent; filters cut decision fatigue | MEDIUM | ✅ In scope | Basic only; fuzzy deferred deliberately |
| Product detail page | Answers buying questions before CTA | LOW | ✅ In scope | Includes price, description, external images, category, availability |
| Persistent cart with edit/remove/running total | Cart abandonment soars when carts vanish | LOW | ✅ In scope | Authenticated only; guest carts excluded |
| Backend-authoritative checkout totals | Surprise fees at last step kill conversion; also a security invariant here | MEDIUM | ✅ In scope | Items + ₹40 flat shipping, free ≥ ₹500; integer paise |
| Payment outcome integrity | Users expect honest, consistent payment results | HIGH | ✅ In scope | Deterministic mock: success / known failure / lost response / unavailable; unknown ≠ failed |
| Order confirmation + history + details | Post-purchase reassurance is universal | LOW-MED | ✅ In scope | In-app; orders retain purchase-time price info |
| Order status visibility (lifecycle) | "Where is my order?" is the #1 post-purchase question | MEDIUM | ✅ In scope | Lifecycle decided 2026-11-16; customer/admin cancel until shipped; merchant marks shipped |
| Merchant self-service onboarding | Supply side must be able to start unaided | MEDIUM | ✅ In scope | No approval queue (deliberate) |
| Merchant product CRUD + publish/archive | Sellers must manage supply | MEDIUM | ✅ In scope | Simple products only, no variants |
| Merchant inventory management | Oversell destroys trust instantly | MEDIUM | ✅ In scope | Atomic conditional decrement at checkout |
| Seller order view + fulfilment actions | Merchants can't operate without seeing their orders | MEDIUM | ✅ In scope | Backend-enforced permissions and allowed actions |
| Merchant isolation (no cross-tenant access) | Multi-merchant platform integrity baseline | MEDIUM | ✅ In scope | Backend ownership enforcement |
| Admin oversight of users/merchants/catalogue/orders | Platform can't operate when exceptions occur | MEDIUM-HIGH | ✅ In scope | Minimum capability only; env-email bootstrap |
| Stock visibility on product page | Shoppers expect honest availability display | LOW | ✅ Implied in scope | Availability re-checked at purchase boundaries; show current stock status on PDP — verify during phase planning |
| Catalogue pagination/empty states | Basic usability at any catalogue size | LOW | ✅ Implied in scope | Stage 2 seeds ~50k products reference target; pagination is needed from day one |
| **Transactional notifications (email) on state changes** | Every marketplace MVP checklist includes "emails for every state change" (Easify, toimi, Sharetribe) | MEDIUM | ⚠️ **GAP — owner review** | Not in Active requirements, not in Out of Scope. In-app order confirmation exists, but order/shipping/payment email notifications are absent from the agreed scope. Zero-spend-compatible option: log-based/dev "email" sink or free-tier transactional provider; decide whether v1 ships without any email or with a minimal notifier |
| **Refund semantics for PAID orders** | Cancellation after payment must define what the customer "gets back" | LOW-MED | ⚠️ **GAP — owner review (minor)** | Lifecycle has CANCELLED and PAYMENT_FAILED but no REFUNDED state. Customer/admin can cancel until SHIPPED — cancelling a PAID order implies a mock-money refund. Needs an explicit rule (e.g., cancel-after-payment → CANCELLED + mock refund recorded) — this is a §7-style business decision, not auto-addable |
| **Reviews and ratings** | Marketplace trust signal; several sources call it table stakes for marketplaces specifically | MEDIUM-HIGH | ⚠️ **GAP — owner review (defer is legitimate)** | Absent from scope AND from the Out of Scope list — currently undefined. Sources split: Cubix/Sharetribe/Bubble list reviews in marketplace MVPs; Easify/toimi say defer when transaction volume can't generate them. For a portfolio demo with seed data, **recommend confirming deferral explicitly** rather than leaving it undefined |
| Guest checkout | Baymard-class consensus: forced account creation is a top abandonment cause | MEDIUM | ❌ Deliberate exclusion (see Deviations) | Already owner-decided; documented, not a silent gap |
| Multiple payment methods / wallets | Consumer expectation in real commerce | HIGH | ❌ N/A — mock payment only | Meaningless under deterministic mock payment; revisit only if real payments ever become a scope decision |
| Shipping cost visibility before payment | Surprise costs kill checkout | LOW | ✅ In scope | Flat ₹40 / free ≥ ₹500 is simple and displayable upfront |
| HTTPS / security posture | Trust + non-negotiable baseline | LOW | ✅ In scope | Server-side validation, ownership enforcement, no raw card data |
| Terms/privacy policy pages | Legal/trust baseline for real marketplaces | LOW | ⚠️ Minor gap | Portfolio demo — lightweight static pages are cheap; owner may consider them optional for a demo deployment |

### Differentiators (Competitive Advantage)

Not expected at MVP; noted for **later stages only**. Do not pull into v1 without explicit owner approval.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Fuzzy/typo-tolerant search | Recovers failed searches; explicitly "deferred, not abandoned" in master doc | MEDIUM | Natural v1.x candidate; sources rate search quality as the highest-ROI discovery investment once catalogue grows |
| Product reviews with seller replies | Marketplace trust flywheel | MEDIUM-HIGH | Needs order-completion linkage; only valuable with transaction frequency |
| Recommendations ("related", "recently viewed") | AOV lift; needs behavioural data to be non-noisy | MEDIUM | Explicitly growth-stage in all sources |
| Wishlist / saved items | Return-visit mechanism | LOW-MED | Cheap but not table stakes |
| Merchant earnings/payout dashboard | Real marketplaces need payout visibility | HIGH | Meaningless under mock payment (no money moves); would only matter with real payments |
| Promotions/coupons | Conversion lever | MEDIUM | per-category rates and promotions are "skip/manual" in toimi's v1 table |
| Personalization | Retention | HIGH | Growth-stage everywhere |
| Semantic/AI search | Discovery quality at scale | HIGH | Fits the optional AI extension or Stage 2+ catalogue work |
| Merchant analytics (sales, views) | Seller stickiness ("single-player tool") | MEDIUM | Useful later; not needed to prove the loop |
| Real-time inventory sync across channels | Operational maturity | HIGH | No other channels exist in v1 |

### Anti-Features (Deliberately NOT Built — confirm master-document exclusions)

These match PROJECT.md Out of Scope exactly; research confirms each exclusion is defensible, not an oversight:

| Anti-Feature | Why Requested | Why Problematic (here) | Alternative |
|--------------|---------------|------------------------|-------------|
| Real payment processing / card data | Realism, demo credibility | Forbidden by master doc; PCI scope; zero-spend risk; source of the hardest failure modes | Deterministic mock payment with 4 scripted, repeatable outcomes + idempotency ledger — this is actually a *demonstration strength* |
| Guest carts / cart merging | Conversion convenience | Undermines the authenticated-persistent-cart design goal; merge logic is a known complexity swamp | Authenticated cart only; Clerk sign-in is one click via social providers |
| Product variants / configurables | Retail realism | Multiplies SKU/price/inventory/order complexity for a portfolio-scale product | Simple products; orders retain purchase-time price so integrity is preserved |
| Merchant image uploads + image storage | Seller convenience | Hosting/storage cost conflicts with zero-spend; abuse surface | Validated external image URLs |
| Manual merchant approval queue | Platform quality control | Explicitly excluded from initial experience; adds an ops burden and a workflow stage | Self-service onboarding + admin *reactive* takedown (owner decision 2026-11-16) |
| Enterprise admin / moderation / trust-and-safety | "Might need it someday" | Scope spiral; master doc forbids expanding admin into an enterprise platform | Minimum admin capability: users, merchants, categories, order operations |
| Fuzzy search (in v1) | Search quality | Fine-grained search infra (typo tolerance, synonyms, ranking) is disproportionate to initial catalogue | Basic keyword search/sort/filter; fuzzy deferred-not-abandoned |
| Storybook | Component polish | Not a Stage 1 requirement; tool overhead without demonstrated need | Component tests + browser E2E (Playwright) |
| Better Stack beyond verified free cap | Observability | Billable over-quota ingestion | Pino structured logs mandatory either way; hosted only inside verified zero-spend cap |
| Microservices/brokers/K8s in v1 | Architecture résumé | Speculative scale violates §5 | Modular monolith; Stages 3–5 optional |

**Two scope deviations from industry norms are worth stating openly (both already owner-decided, listed here so reviewers don't mistake them for gaps):**

1. **No guest checkout.** Industry consensus calls guest checkout table stakes for consumer conversion. The exclusion is deliberate and documented (master doc: "Guest carts and cart merging are excluded"). Acceptable for a portfolio product whose point is the authenticated journey — but it *is* a known conversion-pattern deviation, worth a line in the eventual engineering docs.
2. **No listing moderation before publish.** Standard marketplace MVP checklists include a moderation queue; the master doc chose self-publish + reactive takedown. Defensible for a curated demo; the admin takedown capability must actually exist to back this up (it does, under "catalogue configuration" oversight).

---

## Feature Dependencies

```
[Clerk auth + local user provisioning]
    └──requires──> [Admin bootstrap via env email list]        (for admin role)
    └──enables──> [Authenticated persistent cart]
                      └──requires──> [Checkout]
                                         └──requires──> [Backend totals engine (₹40/₹500, paise)]
                                         └──requires──> [Inventory validation (atomic conditional decrement)]
                                         └──requires──> [Mock payment (idempotency key + attempt ledger + inquiry)]
                                                └──enables──> [Order lifecycle states]
                                                      └──enables──> [Customer order history/details]
                                                      └──enables──> [Seller order management]
                                                      └──enables──> [Admin order operations]

[Merchant onboarding] ──enables──> [Store profile] ──enables──> [Product CRUD] ──enables──> [Inventory mgmt]
                                                        └──feeds──> [Public catalogue]

[Admin categories] ──required-by──> [Product creation]      (one category per product)

[Merchant isolation / ownership enforcement] ──underpins──> [All merchant + admin capabilities]

[Cancellation of PAID orders] ──requires──> [Refund semantics decision]   ⚠️ open gap
[Email notifications] ──requires──> [Order lifecycle events]              ⚠️ open gap (feature, not blocker)
```

### Dependency Notes

- **Checkout is the dependency hub.** Backend totals, inventory validation, mock-payment idempotency, and the order lifecycle all converge there; phase ordering must put their primitives (money handling, inventory decrement, payment attempt ledger) before or within the checkout phase.
- **Admin categories gate product creation** (owner decision: one category per product, admin-managed list) — category configuration must exist before merchant catalogue seeding.
- **Merchant onboarding requires role activation, not approval** — the self-publish decision means catalogue correctness (validation, URL checks) replaces moderation as the quality gate.
- **Refund semantics block the cancellation edge case**, not the happy path: PAID → CANCELLED can be deferred only if cancellation-after-payment is temporarily disallowed — that itself is a product decision requiring owner input.

---

## MVP Definition

### Launch With (v1 — as already agreed)

- [x] Clerk auth + display name + local user provisioning (decided)
- [x] Public catalogue: search, sort, filter, admin-managed categories
- [x] Authenticated persistent cart (no guest, no merge)
- [x] Checkout with backend totals + deterministic mock payment (4 scenarios, idempotent)
- [x] Customer order confirmation, history, details
- [x] Self-service merchant onboarding + store profile
- [x] Merchant product CRUD, external-URL images, inventory management
- [x] Seller-facing order management (backend-enforced)
- [x] Minimum platform admin (users, merchants, categories, orders; env-email bootstrap)
- [x] Server-side validation, ownership enforcement, data integrity, tests

### Flag for Owner Review (genuine gaps — decision required, not auto-add)

- [ ] **Transactional email notifications on order/payment/shipping state changes** — absent from both Active and Out of Scope. Recommend either (a) explicit deferral to a later milestone, or (b) minimal v1 notifier using a log-based sink to honour zero-spend. Currently *undefined*, which is worse than either choice.
- [ ] **Refund/credit semantics when a PAID order is cancelled** — lifecycle states don't cover it. Recommend: cancel-after-payment allowed, recorded as mock refund on the attempt ledger; needs owner confirmation per §7 (order lifecycle is explicitly an owner-input area).
- [ ] **Reviews/ratings** — recommend explicitly recording "deferred" in Out of Scope rather than leaving undefined. Defer is defensible (transaction volume argument), but it should be a recorded decision, not an omission.
- [ ] *(Minor)* Terms/privacy static pages — owner may waive for a portfolio demo.

### Add After Validation (v1.x / later milestones)

- [ ] Fuzzy search — master doc already signals this ("deferred, not abandoned"); natural first enhancement once catalogue grows
- [ ] Wishlist — cheap retention feature
- [ ] Merchant analytics dashboard — seller stickiness
- [ ] Promotions/coupons — only when a business rule justifies it

### Future Consideration (v2+ / optional stages)

- [ ] Reviews with photos and seller replies — needs real transaction frequency
- [ ] Recommendations/personalization — needs behavioural data
- [ ] Real payments (would be a major scope + budget decision, triggering provider research)
- [ ] Semantic/AI search — fits the optional AI extension
- [ ] Native mobile (Stage 4), microservices (Stage 3) — per master doc stages

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Core transaction loop (catalogue → cart → checkout → order) | HIGH | HIGH | P1 — already agreed |
| Merchant supply loop (onboard → list → stock → fulfil) | HIGH | HIGH | P1 — already agreed |
| Minimum admin oversight | HIGH (operational) | MEDIUM-HIGH | P1 — already agreed |
| Stock visibility + pagination on storefront | MEDIUM | LOW | P1 — implicit; verify in phase planning |
| Email state notifications | MEDIUM | MEDIUM | P2 — **gap pending owner decision** |
| Refund semantics (cancel-after-payment) | MEDIUM (integrity) | LOW | P1-level decision, tiny build cost — **gap pending owner decision** |
| Reviews/ratings | MEDIUM | MEDIUM-HIGH | P3 — recommend explicit deferral |
| Fuzzy search | MEDIUM | MEDIUM | P2 (v1.x) |
| Wishlist, recommendations, merchant analytics | LOW-MEDIUM | LOW-HIGH | P3 |

**Priority key:** P1 = launch-critical · P2 = early follow-up · P3 = future consideration

---

## Competitor / Reference Feature Analysis

| Feature | Etsy (marketplace) | Shopify store (single-merchant) | Sharetribe MVP guidance | ecom-v1 approach |
|---------|--------------------|--------------------------------|--------------------------|------------------|
| Discovery | Search + facets + recommendations | Search + filters + collections | Search on "attributes buyers choose by" | Basic search/sort/filter, admin categories — matches MVP guidance |
| Cart | Authenticated, persistent | Persistent incl. guest | Checkout when payment is central | Authenticated-only persistent cart (deliberate deviation) |
| Checkout | Account + multiple wallets | Guest-first + wallets | Gateway + commission + payout | Backend-authoritative totals + deterministic mock payment (no money moves) |
| Trust | Reviews, badges, messaging | Reviews, policies | Verification appropriate to risk | Backend-enforced integrity; reviews flagged as undefined gap |
| Seller tools | Dashboards, ads, analytics | Full store admin | Listings + orders + earnings | Store profile, product CRUD, inventory, seller orders (no earnings — mock money) |
| Moderation | Approval/flagging systems | None (own store) | MVP checklist includes moderation queue | Self-publish + admin reactive takedown (deliberate deviation) |
| Admin | Enterprise platform | Store-level only | Users, listings, transactions, refunds | Minimum capability, explicitly bounded |

---

## Sources

- Appfyl — *Marketplace App MVP Features: Buyer, Seller, Admin and Payments* (2026-07) and *Marketplace App Development: Transactions and MVP* (2026-05/10) — role-based MVP feature maps; "prove one transaction loop" framing
- Easify Technologies — *Marketplace MVP Development* (2026-10) — build-in-transaction-order principle; minimum feature checklist incl. transactional emails; "reviews only with transaction frequency"
- Toimi — *How to Build a Marketplace Website: MVP, Supply, Payments* (2026-10) — v1-must/later/skip feature table; scope-fight warnings (messaging, mobile)
- Cubix — *Top 9 Features of Every Successful Marketplace Platform* — marketplace domain checklist by area
- Sharetribe Academy — *How to start an online marketplace in 10 practical steps* — buyer/seller/operator core feature triads
- PoliteTech — *Scoping a Marketplace MVP* (2026-02) — cold-start/supply-side thinking; admin panel importance
- Baymard-derived industry sources: Emergent (2026-09), Deuex (2026-05), LitExtension (2026-05), Suplex (2026), LaunchWork (2026-02), Lucidly, Nirmal — storefront table stakes: navigation, search quality, filters, product page completeness, guest checkout, cart persistence, checkout friction, order confirmation
- PlanSmith — *Ecommerce website features: the counted list from 90 real store platforms* (2026-09) — idempotent payment confirmation, stock re-check at order creation (both already satisfied by agreed scope)
- Internal authoritative: `master-document.md` §2–§3, §5, §7; `.planning/PROJECT.md` (Active requirements, Out of Scope, Key Decisions 2026-11-16)

---
*Feature research for: marketplace-lite e-commerce (ecom-v1, Stage 1)*
*Researched: 2026-11-16*
