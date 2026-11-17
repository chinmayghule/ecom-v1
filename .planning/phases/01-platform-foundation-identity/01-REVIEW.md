---
phase: 01-platform-foundation-identity
reviewed: 2026-11-17T10:39:47Z
depth: standard
files_reviewed: 65
files_reviewed_list:
  - .github/workflows/ci.yml
  - apps/api/.dockerignore
  - apps/api/.env.example
  - apps/api/nest-cli.json
  - apps/api/package.json
  - apps/api/prisma/migrations/0001_identity_foundation/migration.sql
  - apps/api/prisma/schema.prisma
  - apps/api/prisma7.config.ts
  - apps/api/scripts/emit-openapi.cjs
  - apps/api/scripts/test-migrations.sh
  - apps/api/src/app.module.ts
  - apps/api/src/common/auth/auth.module.ts
  - apps/api/src/common/auth/auth.types.ts
  - apps/api/src/common/auth/clerk-auth.guard.ts
  - apps/api/src/common/auth/clerk-token-verifier.ts
  - apps/api/src/common/auth/current-user.decorator.ts
  - apps/api/src/common/auth/is-public.decorator.ts
  - apps/api/src/common/authorization/capability.guard.ts
  - apps/api/src/common/authorization/require-capability.decorator.ts
  - apps/api/src/common/config/env.validation.ts
  - apps/api/src/common/database/prisma.module.ts
  - apps/api/src/common/database/prisma.service.spec.ts
  - apps/api/src/common/database/prisma.service.ts
  - apps/api/src/common/database/schema.spec.ts
  - apps/api/src/common/errors/api-error.ts
  - apps/api/src/common/errors/api-exception.filter.spec.ts
  - apps/api/src/common/errors/api-exception.filter.ts
  - apps/api/src/common/logging/logging.module.ts
  - apps/api/src/common/logging/pino.config.spec.ts
  - apps/api/src/common/logging/pino.config.ts
  - apps/api/src/common/validation/validation.pipe.spec.ts
  - apps/api/src/common/validation/validation.pipe.ts
  - apps/api/src/health/health.controller.ts
  - apps/api/src/health/health.module.ts
  - apps/api/src/health/health.service.ts
  - apps/api/src/health/health.spec.ts
  - apps/api/src/identity/account-lifecycle.e2e-spec.ts
  - apps/api/src/identity/account-lifecycle.repository.ts
  - apps/api/src/identity/account-lifecycle.service.ts
  - apps/api/src/identity/account-lifecycle.types.ts
  - apps/api/src/identity/admin-bootstrap.policy.ts
  - apps/api/src/identity/clerk-account-revocation.service.ts
  - apps/api/src/identity/dto/account-deletion.dto.ts
  - apps/api/src/identity/dto/user-profile.dto.ts
  - apps/api/src/identity/identity.controller.ts
  - apps/api/src/identity/identity.e2e-spec.ts
  - apps/api/src/identity/identity.module.ts
  - apps/api/src/identity/identity.repository.ts
  - apps/api/src/identity/identity.service.ts
  - apps/api/src/identity/identity.types.ts
  - apps/api/src/main.ts
  - apps/api/src/openapi.ts
  - apps/api/src/test/app.e2e-spec.ts
  - apps/api/src/test/fixtures/private-resource.fixture.ts
  - apps/api/src/test/phase-01-acceptance.e2e-spec.ts
  - apps/api/src/test/setup.ts
  - apps/api/tsconfig.build.json
  - apps/api/tsconfig.json
  - apps/api/vitest.config.ts
  - docs/architecture/phase-01-journeys.md
  - docs/identity/account-deletion.md
  - docs/identity/clerk-integration.md
  - docs/operations/local-development.md
  - docs/verification/phase-01-verification.md
  - scripts/verify-phase-01.sh
findings:
  critical: 1
  warning: 5
  info: 3
  total: 9
status: issues_found
---

# Phase 01: Code Review Report

**Reviewed:** 2026-11-17T10:39:47Z
**Depth:** standard
**Files Reviewed:** 65
**Status:** issues_found

## Summary

Adversarial review of the Phase 1 platform foundation and identity API. The overall architecture is disciplined: deny-by-default global guards, a single config/validation/error/logging boundary, a keyed tombstone written atomically with anonymization, ON DELETE RESTRICT foreign keys, and an append-only audit trigger. Guard ordering, ownership scoping, PII sanitization and the exception/logging boundaries were checked and found sound.

However, one security control is silently disabled by a config shape that passes validation, and the account-deletion lifecycle has several concurrency/idempotency defects that can corrupt provider-outcome state and audit integrity. Findings are detailed below. (No structural pre-pass findings were supplied for this phase, so there is no "Structural Findings (fallow)" section.)

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: Empty authorized-parties list silently disables the `azp` origin check

**File:** `apps/api/src/common/config/env.validation.ts:49-51`, `apps/api/src/common/auth/auth.types.ts:57-64`, `apps/api/src/common/auth/clerk-token-verifier.ts:42,54`
**Issue:** `CLERK_WEB_ORIGIN` is validated only with `@IsNotEmpty()` on the raw string. A comma/whitespace-only value such as `","`, `" , "` or `" ,,"` is non-empty and passes `validateEnv()`, but `parseWebOrigins()` reduces it to `[]`. The verifier then passes `authorizedParties: []` to `@clerk/backend`'s `verifyToken()`. I confirmed against the pinned SDK (`@clerk/backend@3.29.0`, `dist/chunk-XQX6JGUU.mjs:210-213`):

```js
var assertAuthorizedPartiesClaim = (azp, authorizedParties) => {
  if (!authorizedParties || authorizedParties.length === 0) {
    return; // azp check skipped entirely
  }
  ...
```

So the `azp` (authorized party) verification is skipped completely. A token signed by the instance key but minted for an unapproved origin — or with no `azp` — is accepted. This directly contradicts the documented fail-closed guarantee in `docs/identity/clerk-integration.md:78-88` ("a token from an unapproved origin is rejected"). The supply-chain/CI placeholders do not catch this because the value is syntactically non-empty.
**Fix:** Fail startup when the parsed allowlist is empty and validate each entry as a well-formed origin, and defend in depth in the verifier:

```ts
// env.validation.ts — after parsing in validateEnv()
const webOrigins = parseWebOrigins(parsed.CLERK_WEB_ORIGIN);
if (webOrigins.length === 0) {
  throw new ConfigurationError(['CLERK_WEB_ORIGIN']);
}

// clerk-token-verifier.ts constructor
this.authorizedParties = parseWebOrigins(config.clerkWebOrigin);
if (this.authorizedParties.length === 0) {
  throw new Error('CLERK_WEB_ORIGIN must contain at least one origin');
}
```

Also pin `issuer`/`audience` in `verifyToken()` (see IN-02).

## Warnings

### WR-01: `primaryEmail` claim is optional; empty email is provisioned and can overwrite a stored profile

**File:** `apps/api/src/common/auth/clerk-token-verifier.ts:77`, `apps/api/src/identity/identity.repository.ts:68-80,85-92`
**Issue:** Unlike `displayName` (which throws 403 when missing), a missing/blank `primaryEmail` silently becomes `''`:

```ts
const email = nonEmptyString(claims[CLAIM_PRIMARY_EMAIL]) ?? '';
```

That empty string is written to `users.email` on first create and, worse, overwrites an existing email on every subsequent sign-in via `refreshProfile()`, because `{ email: { not: '' } }` matches the previously-populated value. `docs/identity/clerk-integration.md:64` documents `primaryEmail` as required "for provisioning". A JWT template omission therefore corrupts local profiles instead of failing closed. (Admin bootstrap is not escalated — `isAdminOnFirstCreate('', …)` returns false — so this is a data-integrity/contract defect, not a privilege escalation.)
**Fix:** Treat a missing/blank `primaryEmail` like `displayName` — throw `ForbiddenException(PROFILE_INCOMPLETE)`:

```ts
const email = nonEmptyString(claims[CLAIM_PRIMARY_EMAIL]);
if (email === undefined) {
  throw new ForbiddenException(PROFILE_INCOMPLETE);
}
```

### WR-02: Concurrent `DELETE /users/me` can overwrite `REVOKED` with `FAILED` in the tombstone

**File:** `apps/api/src/identity/account-lifecycle.service.ts:69-72,75-83`, `apps/api/src/identity/account-lifecycle.repository.ts:116-139`, `apps/api/src/identity/clerk-account-revocation.service.ts:59-83`
**Issue:** Two overlapping deletions for the same subject both pass the guard and both compute the same digest. One finalizes and commits the tombstone; the other hits P2002, swallows it in `finalize()`, and — crucially — **still calls `revoker.revoke()`**. Its second `users.deleteUser` returns 404 (`PROVIDER_USER_NOT_FOUND`), is retried 3 times, and returns `FAILED`. `recordProviderOutcome()` then does an unconditional `identityTombstone.update({ where: { subjectDigest } })` and appends `PROVIDER_REVOCATION_FAILED`, overwriting the winner's legitimate `REVOKED` and leaving a `...SUCCEEDED` followed by a `...FAILED` event. The tombstone falsely reports failure and the loser returns a 409 to the client. This violates the documented terminal provider outcome (`docs/identity/account-deletion.md:110-118`).
**Fix:** Make the outcome write conditional and skip re-revocation when already finalized:

```ts
// account-lifecycle.repository.ts recordProviderOutcome()
const updated = await this.prisma.identityTombstone.updateMany({
  where: { subjectDigest, providerRevocationOutcome: 'PENDING' },
  data: { providerRevocationOutcome: outcome, ... },
});
if (updated.count === 1) { /* append the single outcome event */ }

// account-lifecycle.service.ts after swallowing P2002
const tombstone = await this.repository.tombstoneFor(subjectDigest);
if (tombstone?.providerRevocationOutcome === 'REVOKED') {
  return { code: 'ACCOUNT_ANONYMIZED', lifecycleStatus: 'ANONYMIZED' };
}
```

Ideally serialize per subject with a Postgres advisory lock.

### WR-03: P2002 swallow reports success without confirming local anonymization

**File:** `apps/api/src/identity/account-lifecycle.service.ts:75-83`
**Issue:** `finalizeAnonymization()` is one `$transaction`; a P2002 on the tombstone insert rolls back that transaction, including the user-row update that clears PII. `finalize()` swallows P2002 with the comment that a concurrent request "already wrote the keyed tombstone", assuming the user is therefore anonymized, and returns/lets the handler report `ACCOUNT_ANONYMIZED` (204). The code never re-reads `currentStatus(user.id)` to verify the assumption. If a tombstone for that digest exists by any other path, the endpoint returns 204 while the row still holds `email`, `display_name` and a live `clerk_subject`, and the provider is still called.
**Fix:** In the catch, re-read the user row and only continue when it is actually `ANONYMIZED`, otherwise throw (e.g. `ConflictException`) and do not call the provider or claim success.

### WR-04: Repeated closure requests append duplicate lifecycle audit events

**File:** `apps/api/src/identity/account-lifecycle.repository.ts:49-71`, `apps/api/src/identity/account-lifecycle.service.ts:58-61`
**Issue:** Each `DELETE /users/me` while obligations remain calls `acceptClosure()` unconditionally. When the user is already `CLOSURE_ACCEPTED` and stores already `CLOSED`, both `updateMany` calls match zero rows and `deleteMany` removes nothing, but `lifecycleEvent.createMany()` unconditionally inserts `CLOSURE_REQUESTED`, `CLOSURE_ACCEPTED` and `CAPABILITY_REVOKED` again. Every retry inflates the append-only audit log with duplicate, misleading events (`CLOSURE_REQUESTED` is also logged even though no code ever persists that state). The `currentStatus`/`hasOutstandingObligations` read is also outside the mutation transaction (a latent TOCTOU with concurrent order creation).
**Fix:** Make `acceptClosure` idempotent — inspect each `updateMany.count` and insert an event only for transitions that actually changed rows. Move the obligation/status check into the same `$transaction`.

### WR-05: "Permanent" tombstone is invalidated by rotation or loss of a single unvalidated secret

**File:** `apps/api/src/identity/identity.repository.ts:12-14`, `apps/api/src/identity/identity.service.ts:71-74`, `apps/api/src/common/config/env.validation.ts:57-59`
**Issue:** `subjectDigest = HMAC-SHA256(clerkSubject, TOMBSTONE_SECRET)`. `TOMBSTONE_SECRET` is validated only with `@IsNotEmpty()`, so a short or placeholder value passes, and there is no key versioning. If the secret is ever rotated or lost, every existing digest stops matching: a deleted subject with a still-valid token passes `isTombstoned()` (false), `findByClerkSubject()` (null because `clerk_subject` was cleared), and is re-provisioned as a **new** local user — regaining access. This contradicts the documented "permanent, irreversible" deny (`docs/identity/account-deletion.md:81-97`).
**Fix:** Store a key-version id alongside each digest and verify against all historical secrets; treat the tombstone secret as immutable key material. At minimum enforce a minimum length / reject known placeholder values in `validateEnv()` and document that rotation re-opens deleted subjects.

## Info

### IN-01: Documented idempotent `204` on repeat deletion is unreachable over HTTP

**File:** `apps/api/src/identity/account-lifecycle.service.ts:48-52`, `apps/api/src/identity/identity.service.ts:71-74,82-84`, `docs/identity/account-deletion.md:40-42`
**Issue:** `deleteAccount()` has an idempotent `ANONYMIZED → 204 ACCOUNT_ANONYMIZED` branch, but the global guard's resolver rejects tombstoned subjects (401) before the controller runs, and finalization clears `clerk_subject`. Any repeat `DELETE /users/me` (or `GET /users/me`) with the same token returns 401, not 204. The branch is dead code over HTTP, and the lifecycle table documents a behavior clients cannot observe.
**Fix:** Either document replay as 401 and remove the dead branch, or explicitly allow tombstoned subjects to reach `DELETE /users/me` so the idempotent result is real.

### IN-02: Clerk issuer and audience are not pinned at verification

**File:** `apps/api/src/common/auth/clerk-token-verifier.ts:52-55`
**Issue:** Only `jwtKey` and `authorizedParties` are passed to `verifyToken()`. I verified in the SDK (`chunk-XQX6JGUU.mjs:128-134,221-225`) that `assertIssuerClaim` and `assertAudienceClaim` return immediately when `issuer`/`audience` are absent. Signature binding to the instance key keeps practical risk low, but the "fail closed" posture is weaker than documented.
**Fix:** Pass configured Clerk `issuer` and `audience` values to `verifyToken()` (sourced from validated env/config).

### IN-03: Provider-outcome audit events are not attributable to an account

**File:** `apps/api/src/identity/account-lifecycle.repository.ts:131-139`
**Issue:** `PROVIDER_REVOCATION_SUCCEEDED`/`FAILED` events are inserted with no `userId` and without the subject digest, so they cannot be joined to the account or tombstone. This weakens the per-account audit trail described in `docs/identity/account-deletion.md:110-118`.
**Fix:** Store `userId` and/or the digest with these events (an added column or a sanitized value in `detail`).

---

_Reviewed: 2026-11-17T10:39:47Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
