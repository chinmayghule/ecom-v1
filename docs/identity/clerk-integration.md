# Clerk Integration Contract (Phase 1)

Clerk owns credentials, sign-up, verification, persistent sessions and browser
sign-out. The NestJS API owns every application capability and ownership
decision, derived only from local database state. There is no application
password, JWT issuer, refresh-token system or webhook endpoint.

This document is the human configuration contract for the live Clerk instance.
Phase 1 proves the API/token contract and this documented configuration; it does
**not** browser-verify sign-up, sign-in, session persistence or sign-out. Those
are Phase 5's UI deliverable (see `Phase 5 handoff`).

## Sign-up requirements

- Enable email address as an identifier and **enable email verification**. An
  unverified email must never bootstrap an admin capability (the backend checks
  the signed verified flag before the first-create allowlist).
- Require exactly one custom display-name field at sign-up. It is required, not
  optional, and is non-unique. Email is the contact identifier, not the account
  key; the immutable Clerk subject (`sub`) is the unique external key.
- The sign-up UI itself is Clerk-hosted/configured in Phase 1; no application
  credential endpoint is implemented.
- Required environment: `CLERK_JWT_KEY` (instance JWT public key, used by the
  networkless verifier) and `CLERK_WEB_ORIGIN` (approved web origin(s)). Values
  are supplied through the environment, never committed to this document.

## Session persistence

- Clerk manages persistent sessions in the browser; a signed-in user remains
  signed in across browser sessions until the Clerk session expires or is
  ended. The API does not create or store its own session record.
- Each API request carries the current Clerk session token as a bearer token;
  the backend verifies it on every request and resolves a local user. A token
  copied out of the browser remains signature-valid until its own expiry — a
  networkless verifier does not consult live Clerk session state.
- The token must carry the three signed claims below. Default Clerk session
  claims do **not** include profile email, display name or email verification,
  so they must be added explicitly to the session-token JWT template.

## Sign-out

- Browser sign-out ends the **browser-held** Clerk session: the UI clears its
  token and subsequent API calls from that browser have no bearer token and
  receive 401. There is no application session to delete.
- Copied-token and provider-revocation guarantees follow the owner resolution
  in Plan 03 (`keyed-permanent-tombstone-local-first`, recorded in
  `.planning/PROJECT.md` and `01-CONTEXT.md`): a permanent keyed HMAC tombstone
  is written locally in the same transaction as anonymization and is
  authoritative; Clerk provider revocation is attempted with retry and **fails
  closed** — a failed provider call never restores local access. No legal
  retention duration or extra token policy is invented here.
- Browser-level sign-out is not exercised in Phase 1; it is a Phase 5 check.

## Signed claims

Configure the Clerk session-token JWT template to emit these exact claim names
and types. They match the verifier's typed contract in
`apps/api/src/common/auth/clerk-token-verifier.ts`; a name mismatch fails closed
as an incomplete profile.

| Claim name | Type | Source (Clerk session template variable) | Required |
|------------|------|-------------------------------------------|----------|
| `sub` | string | Clerk subject (standard claim) | yes — 401 if absent |
| `primaryEmail` | string, non-empty | `{{user.primary_email_address}}` | yes for provisioning |
| `displayName` | string, non-empty | the required sign-up display-name value (e.g. `{{user.full_name}}` or the required custom field) | yes — 403 profile-incomplete if absent |
| `emailVerified` | boolean, exactly `true` | `{{user.email_verified}}` (primary-email verified status) | yes for admin bootstrap |

- The API treats `emailVerified === true` as the only verified signal; the mere
  presence of an email is not proof of verification. Never infer verification
  from claim existence.
- Confirm the current Clerk dashboard variable names for the email-verified
  status and the required custom display-name field when configuring the live
  instance; the API contract is the claim **name and type**, not the template
  variable spelling.
- Claims are read from `unknown` and narrowed at the boundary. No token, secret
  or profile value is logged.

## Authorized parties and bearer transport

- Configure the approved web origin(s) as Clerk authorized parties and mirror
  the same allowlist in `CLERK_WEB_ORIGIN` (comma-separated). The verifier passes
  these as `authorizedParties` to `@clerk/backend` `verifyToken()`; a token from
  an unapproved origin is rejected.
- The same allowlist drives the API's explicit CORS origin allowlist with
  credentials — never a wildcard origin with credentials.
- Transport is a single, unambiguous `Authorization: Bearer <token>` header.
  No cookie fallback, no multiple/ambiguous headers, no decode-before-verify.
  The global guard is deny-by-default: only `@IsPublic()` routes bypass it.

## No webhook provisioning

- Local users are provisioned on the first verified request by immutable Clerk
  subject, using a conflict-safe create plus fallback read. No public webhook
  endpoint exists and no provider account is created by the API.
- Local profile copies (email, display name) refresh from verified claims.
  Platform-admin capability is granted only in the first-create branch, from a
  normalized verified email matching the `ADMIN_EMAILS` allowlist; later profile
  refreshes neither grant nor revoke it. Capability changes are explicit
  backend operations.
- Application capabilities are application-owned and stored locally. Clerk
  metadata or role claims are never used for application authorization.

## Phase 5 handoff

- Phase 5 wires the Clerk UI and consumes the API's bearer contract. The browser
  journey (sign-up with required display name, email verification, sign-in,
  session persistence across browser sessions, sign-out and subsequent 401) is
  verified there, not in Phase 1.
- Phase 1 delivers the backend/token contract, the API integration tests and
  this configuration document. Browser-level verification is explicitly out of
  Phase 1 scope.

## Live Clerk verification procedure

This is a repeatable **manual configuration check** for the owner; it is never
recorded as an automated pass and no repository CLI can assert dashboard state.

1. In the Clerk dashboard, confirm sign-up requires email plus one custom
   display-name field and that email verification is enabled.
2. Confirm the session-token JWT template emits `primaryEmail` (string),
   `displayName` (non-empty string) and `emailVerified` (boolean) from the
   current documented Clerk variables.
3. Confirm the authorized-party list matches the API's `CLERK_WEB_ORIGIN`
   allowlist exactly, and that no unintended origin is present.
4. Sign in to the live instance and copy a fresh test session token. Decode its
   payload locally (for example with a base64 decode of the JWT payload segment)
   and confirm it carries those three signed claims with the expected types.
   Do not paste the token into source control, logs or this document.
5. Send `GET /users/me` to the API with `Authorization: Bearer <token>` and
   confirm the response is the local profile with server-derived capabilities
   and no Clerk subject or internal fields.
6. Record the outcome of this manual check in the phase verification artifact.
   Do not exercise browser sign-up/sign-in/persistence/sign-out here — that is
   Phase 5's browser-level handoff.
