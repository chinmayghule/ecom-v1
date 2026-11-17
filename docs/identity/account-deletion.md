# Account Deletion and Merchant Closure

This document is the operational contract for `DELETE /users/me`. It implements
the owner's binding resolutions of 2026-11-17 recorded in `.planning/PROJECT.md`
and `01-CONTEXT.md`: **staged closure** for merchant obligations and a
**keyed-permanent-tombstone-local-first** identity lifecycle with fail-closed
provider revocation. No legal retention period or new lifecycle state was
supplied, so none is implemented here.

A deletion **request** is not necessarily a completed deletion. When outstanding
obligations exist, the request accepts closure (stops new sales) but final
anonymization is deferred until those obligations resolve.

## Lifecycle states

The state names below are the ones designed in the Plan 04 schema; they are not
invented here.

**User (`users.lifecycle_status`):**

```
ACTIVE ──request──> CLOSURE_REQUESTED ──accept──> CLOSURE_ACCEPTED ──obligations resolved──> ANONYMIZED
   │                                                    │
   └── no obligations ───────────────────────────────────┴─────────────────────────────────> ANONYMIZED
```

**Store (`stores.status`):**

```
ACTIVE ──closure accepted──> CLOSURE_REQUESTED ──> CLOSED
```

`CLOSED` stops new sales. The store, its merchant owner and every order remain
in the database. Orders distinguish in-flight obligations
(`PENDING_PAYMENT`, `PAID`, `SHIPPED`) from terminal retained references
(`DELIVERED`, `CANCELLED`, `PAYMENT_FAILED`).

| Caller state | Obligations? | Outcome | HTTP |
|---|---|---|---|
| `ACTIVE` | No | Anonymized in one transaction | 204 |
| `ACTIVE` / `CLOSURE_REQUESTED` | Yes | Closure accepted, no anonymization yet | 202 |
| `ANONYMIZED` | n/a | Idempotent completed result | 204 |

## Anonymized fields

Final anonymization happens only when there are no outstanding obligations. In
one database transaction the following personal profile columns are set to
`NULL`:

| Column | Table | Before | After finalization |
|---|---|---|---|
| `email` | `users` | verified profile email | `NULL` |
| `display_name` | `users` | required display name | `NULL` |
| `clerk_subject` | `users` | immutable Clerk `sub` link | `NULL` |
| `ADMIN` capability | `user_capabilities` | explicit admin grant | removed |

The nullable `email` / `display_name` columns exist precisely so this D-07
anonymization can clear them; `NULL` means "anonymized", never "unknown".
`ADMIN` is removed explicitly by the lifecycle transaction — never as a side
effect of a profile refresh. The raw Clerk subject is never written into the
tombstone or any log.

## Retained fields

No user, store, merchant or order row is deleted, and there is no cascade.
These stable references survive finalization so order history and audit stay
consistent:

| Field | Table | Reason retained |
|---|---|---|
| `id` | `users` | Stable local buyer/merchant reference; survives anonymization |
| `lifecycle_status` | `users` | Non-PII lifecycle state |
| `owner_user_id` | `stores` | Retained store ownership (`ON DELETE RESTRICT`) |
| `buyer_user_id` | `orders` | Retained, now anonymized, buyer reference |
| `store_id` | `orders` | Retained order → store link |
| `event_type`, `outcome`, `detail` | `lifecycle_events` | Append-only, non-PII audit trail |

The order keeps an anonymized buyer reference: the stable local `id`, not an
email or display name.

## Tombstone

The tombstone is a **permanent, keyed pseudonymous deny marker**:

- `identity_tombstones.subject_digest` is an HMAC-SHA256 of the Clerk external
  subject with the server-side `TOMBSTONE_SECRET` (`SUBJECT_DIGEST` is 64 hex
  characters). No raw Clerk subject, email or other identifier is stored.
- It is written in the **same local transaction** as anonymization, so a
  deleted subject is denied re-provisioning immediately — before, and
  independently of, any provider call. The local tombstone is authoritative.
- `expires_at` is always `NULL`: the deny is indefinite/permanent. It is
  irreversible and cannot be read to learn the person's identity.
- The global auth guard checks the keyed digest before provisioning, so a
  copied bearer token that is still signature-valid until expiry is denied and
  cannot create a new local user.
- A duplicate digest (concurrent deletion) is treated as an already-denied
  subject; it does not create a second identity.
- `TOMBSTONE_SECRET` is **immutable key material**. `validateEnv()` rejects
  short or obviously placeholder values at startup. Rotating or losing it
  invalidates every stored digest: a deleted subject with a still-valid token
  would no longer match its tombstone and could be re-provisioned, regaining
  access. Rotation therefore requires a key-version migration that re-hashes
  all existing tombstones; never rotate the secret in place.

## Provider revocation

Provider-side account revocation uses the official Clerk backend SDK
(`createClerkClient({ secretKey: CLERK_SECRET_KEY }).users.deleteUser`) against
the verified external subject. It is attempted **after** the local transaction
commits. The local tombstone is the durable deny mechanism — networkless token
verification cannot prove live session state, so a copied bearer token stays
signature-valid until expiry and is denied locally rather than by the provider.

Fail-closed behavior:

- Provider revocation is retried up to three attempts.
- On success the tombstone records `REVOKED`, the attempt count and the
  revocation time; a `PROVIDER_REVOCATION_SUCCEEDED` audit event is appended.
- On failure (network/timeout, auth/config, rate limit, 5xx or user-not-found)
  the tombstone records `FAILED`, the attempt count and a **sanitized stable
  error class** — never a raw provider message, secret or subject. A
  `PROVIDER_REVOCATION_FAILED` event is appended.
- A provider failure never rolls back or reverses the committed anonymization
  and never restores local access. The person remains locked out locally.

## Restricted merchant actions

When a user with merchant/store/order obligations requests closure:

- New sales stop: owned stores transition to `CLOSED` and their products are no
  longer sellable.
- The store, merchant and order records are retained; `buyer_user_id` and
  `owner_user_id` are never cascade-deleted.
- The `MERCHANT` capability is **retained** so the owner can finish restricted
  completion and refund work on in-flight orders. The `ADMIN` capability is
  removed explicitly.
- Personal data is **not** anonymized until every in-flight obligation is
  terminal (anonymization trigger = obligations resolved, D-08). Calling the
  endpoint again after obligations resolve finalizes the deletion.

The signed-in account owner alone may request closure; the endpoint accepts no
target user id or role. A client-supplied identity field is rejected by the
global validation boundary.

## Retry and conflict responses

| Status | `code` | Meaning | Client action |
|---|---|---|---|
| 204 | — (no body) | Anonymization completed and provider revocation succeeded | None; access is permanently denied |
| 202 | `CLOSURE_ACCEPTED` | Closure accepted; anonymization waits for outstanding obligations | Complete/replay when obligations resolve |
| 409 | `PROVIDER_REVOCATION_FAILED` | Local anonymization committed; provider revocation failed and will be retried | No access restored; provider retry is operational |

Responses carry only a stable `code` and a non-sensitive `lifecycleStatus`.
Provider messages, the Clerk subject, the tombstone digest and any profile
value are never returned to a client or emitted in logs. Any provider error is
retryable and reportable; none is treated as permission to restore access.

## Legal retention not implemented

No legally required retention duration or exception was supplied by the owner.
This implementation does **not** invent a legal retention period, a timed
anonymization job, a legal hold or a reopen path based on an assumed rule.
Retained business records are kept for referential integrity (orders, audit),
not because of an assumed statutory duration. If a legal retention requirement
is supplied later, it must be recorded as an owner decision before any such
behavior is added.
