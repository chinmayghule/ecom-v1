# Phase 1 Journeys — Contract Map and Downstream Ownership

Phase 1 (Platform Foundation & Identity) ships no browser UI and no commerce
modules. This document maps each actor's real journey to the API contract that
Phase 1 provides and names the later phase that owns the remaining substance.
It exists so every subsequent contract serves its actual consumer, not so that
Phase 1 implements those consumers.

**Phase 1 API touchpoints (delivered here):**

- `POST`/`GET` boundaries are protected by the deny-by-default Clerk bearer guard and
  the server-side capability guard; the global validation pipe and sanitized exception
  filter own every request.
- `GET /health/live` (process-only) and `GET /health/ready` (real PostgreSQL probe,
  fails closed with 503 while unavailable).
- `GET /users/me` — the minimal, server-derived local profile (`id`, `email`,
  `displayName`, `capabilities`); the Clerk subject, tombstone and lifecycle internals
  never leave this boundary.
- `DELETE /users/me` — self-only account deletion returning 204 (anonymized), 202
  (`CLOSURE_ACCEPTED`) or 409 (`PROVIDER_REVOCATION_FAILED`), with only stable
  non-sensitive codes.
- The single code-first OpenAPI assembler (`apps/api/src/openapi.ts`) exposes the
  unfrozen `0.1.0` baseline at `/api/docs`; the Phase 4 generator and drift gate
  are not part of Phase 1.

Clerk-facing configuration and the manual live-instance procedure live in
[`docs/identity/clerk-integration.md`](../identity/clerk-integration.md); the
deletion/closure contract lives in
[`docs/identity/account-deletion.md`](../identity/account-deletion.md).

## Customer journey

**Phase 1 contract (already enforced at the API boundary):**

1. **Register and verify through Clerk.** Email plus a required display name at
   signup, email verification enabled, and a session token carrying the primary
   email, display name and primary-email-verified claim (AUTH-01/02/05). The exact
   dashboard configuration is a manual owner contract, not a Phase 1 browser pass.
2. **Sign in and make the first protected request.** The verified bearer token is
   checked with the official networkless verifier against explicit authorized
   parties; the first signed-in request provisions exactly one local application
   user from the immutable Clerk subject, with no public webhook (AUTH-02/04).
   Customer is the implicit baseline capability.
3. **Read the current profile.** `GET /users/me` returns only the local id, email,
   display name and capabilities. Email/display name are refreshed from verified
   claims on each sign-in; role changes are never derived from a changed email.
4. **Buy later.** Cart, checkout, mock payment and order endpoints do **not**
   exist in Phase 1. The API contract is shaped so those Phase 3 resources will be
   owned-scoped by the current local user id in one database predicate (a foreign
   row is a non-disclosing 404), and the Phase 1 ownership proof exercises that
   exact pattern in a test-only fixture.
5. **Delete the account.** `DELETE /users/me` anonymizes personal fields in place,
   retains the stable local id and any order references, and writes a permanent
   keyed HMAC tombstone so a copied, still-valid token cannot re-provision the
   subject (AUTH-06).

**Downstream owners:** the storefront, Clerk sign-in UI, session persistence,
sign-out UI, catalogue browsing, product detail, cart, checkout, order
confirmation/history/details and cancellation are **Phase 5** presentation work,
built only against the frozen contract. The cart/checkout/order backend rules
themselves are **Phase 3**. The `GET`/`DELETE /users/me` contract used above is
the Phase 1 handoff those phases consume.

## Merchant journey

**Phase 1 contract (already enforced at the API boundary):**

1. A person is first an ordinary customer (Phase 1 provisioning above); merchant
   capability is additive, never a mutually exclusive account type (D-05).
2. `MERCHANT` is a local capability that only the backend grants. Phase 1 proves
   the capability guard admits only server-derived local state and that a client
   cannot supply a role or owner field to escalate.
3. **Staged closure.** A signed-in owner may request closure. With no outstanding
   obligations, deletion finalizes immediately. With in-flight orders/payments,
   `DELETE /users/me` returns `CLOSURE_ACCEPTED` (202): new sales stop, store
   status becomes `CLOSED`, the `MERCHANT` capability is retained for restricted
   completion/refund work, and anonymization is deferred until obligations
   resolve. Only `ANONYMIZED` identities and keyed-tombstoned subjects are denied
   locally, so a staged-closure merchant can still authenticate to finish work.
   No legal retention duration or new lifecycle state was invented.

**Downstream owners:** customer-to-merchant self-onboarding, store profile,
product CRUD, publish/archive, inventory and the gallery-scoped image picker are
**Phase 2** (backend) and **Phase 6** (dashboard UI). Seller-facing order
management — viewing only orders containing the merchant's items and marking
them shipped — is **Phase 3** (backend) and **Phase 6** (UI). Merchant order
actions that consume the retained obligation fields must not introduce an
unapproved timed anonymization job. The admin console is **Phase 6**.

## Admin journey

**Phase 1 contract (already enforced at the API boundary):**

1. **Verified allowlist bootstrap.** On the *first* sign-in of a verified email in
   the `ADMIN_EMAILS` allowlist, the local user is created with the `ADMIN`
   capability. Later sign-ins refresh only the email/display-name copies; a
   changed email can neither grant nor revoke admin (D-04). Phase 1's acceptance
   matrix proves both the first-create grant and that a returning account's role
   is unchanged after an email refresh.
2. **Explicit local capability changes only.** Admin/capability mutations are
   backend operations on local state; no Clerk metadata or client field can
   grant them. Admin is a separate capability that may coexist with customer use.
3. **Privileged route enforcement.** A server-side `@RequireCapability('ADMIN')`
   metadata guard admits admins and denies customers (403); the proof uses a
   test-only fixture route, and later real admin modules adopt the same guard.

**Downstream owners:** the privileged user/merchant/category/order admin APIs,
OpenAPI contract freeze and typed client generation are **Phase 4** — the
backend→frontend handoff gate. Admin dashboard pages are **Phase 6**. Admin
journey browser verification is **Phase 7**. No privileged admin endpoint ships
in Phase 1.

## Gallery seed schema capacity

**Phase 1 scope is exactly one foundation table and nothing else.** Plan 01-04
created a single `gallery_assets` table sized to hold the later ~200 curated
free-stock image records, with columns for the source URL, name, category, tags
and a soft-deactivation marker. That schema capacity is the full Phase 1
deliverable for the gallery item.

Everything else remains later work:

- the gallery module, admin gallery CRUD and admin gallery filtering — **Phase 2**;
- the ~200-image curated seed pipeline — **Phase 2**;
- the merchant multi-image picker from the gallery, with no uploads and no
  arbitrary URLs, and the name/category/tags search/filter parity for that
  picker — **Phase 2** (backend) and **Phase 6** (dashboard UI);
- customer-facing multi-image display and the graceful placeholder for a
  soft-deactivated image — **Phase 5**.

**Not built in Phase 1:** no gallery endpoint, no seed script, no seed data, no
product-image behaviour, no admin gallery screen and no merchant picker. There is
no gallery route in the Phase 1 OpenAPI baseline and no gallery runtime module.

## Phase 5 handoff

Phase 5 consumes the frozen contract from Phase 4 (not this unfrozen baseline)
and owns the browser Clerk UI: sign-up/sign-in with the required display name,
session persistence across browser sessions, and sign-out. These browser
journeys are explicitly **not** verified in Phase 1 — Phase 1 proves the API
token/claims contract and the documented configuration only. They are recorded
as manual/Phase 5 checks in
[`.planning/phases/01-platform-foundation-identity/01-VALIDATION.md`](../../.planning/phases/01-platform-foundation-identity/01-VALIDATION.md).
The live Clerk instance configuration check stays a manual owner action in every
backend phase.
