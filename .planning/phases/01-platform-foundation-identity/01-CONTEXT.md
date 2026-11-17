# Phase 1: Platform Foundation & Identity - Context

**Gathered:** 2026-11-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver a runnable, CI-tested backend monorepo foundation with Docker Compose and PostgreSQL; verified Clerk sessions provision local users; application-owned roles and authorization are enforced server-side; account deletion preserves business/order integrity while anonymizing personal data; Pino logging and a health endpoint provide local operational visibility. Phase 1 also models customer, merchant, and admin journeys so the backend foundation supports later API work.

Phase 1 does not build the merchant gallery, product/catalogue modules, storefront UI, payment flow, or deployment. Merchant closure affects Phase 1 identity lifecycle decisions, but gallery picker parity is implemented in its later owning phases.

</domain>

<decisions>
## Implementation Decisions

### Identity and provisioning
- **D-01:** Clerk remains the credential and authentication provider. Do not store passwords or build custom password authentication, JWT issuance, or refresh-token systems.
- **D-02:** Store Clerk's immutable user ID as the unique external identity key for the local user. Email is not the account identifier; username/display name is required at signup but is non-unique.
- **D-03:** Store email and username/display name in the local profile. Refresh these copies from the verified Clerk identity during sign-in/provisioning; do not add an in-app email-change feature in this project.
- **D-04:** The verified-email environment allowlist bootstraps the local admin capability on first sign-in. Subsequent email changes must not silently grant or revoke admin privileges; changes to existing admin capability are explicit backend operations.

### Role model and authorization
- **D-05:** Customer capability is the baseline. Merchant capability is additive after self-onboarding. Admin is a separate privileged capability and may coexist with customer use; do not model these as mutually exclusive account types.
- **D-06:** Authorization is enforced by the backend per action/resource. Frontend guards are not a security boundary. Continue to prove unauthenticated, role-matrix, and ownership denials with API tests.

### Account deletion and merchant closure
- **D-07:** Do not cascade-delete local identity/business records needed to preserve orders and audit/integrity. Account deletion anonymizes personal profile data while retained orders keep an anonymized buyer reference.
- **D-08:** Merchant deletion/closure is staged rather than immediate destructive deletion: stop new sales when closure is accepted; retain store, merchant, and order records; allow only restricted actions needed to complete outstanding orders and payment/refund work; anonymize personal data when outstanding obligations are resolved, subject to legally required retention.
- **D-09:** Do not leave a closed merchant's products selling indefinitely, and do not strand in-flight orders/refunds by immediately removing the merchant's ability to perform necessary restricted completion actions. Exact state transitions, authorization, retention periods, and legally required exceptions are open for downstream research/planning; do not invent legal policy.

### ORM selection
- **D-10:** ORM choice is deliberately not locked yet. Prisma remains the provisional baseline because project-specific research already exists, but Phase 1 research must perform a bounded Prisma-vs-MikroORM comparison before implementation.
- **D-11:** Limit that comparison to PostgreSQL migrations, NestJS integration, transactions and conditional-update support for checkout correctness, connection pooling, and maintenance/version stability. If MikroORM shows no concrete advantage on these project criteria, proceed with Prisma; do not broaden into an all-ORM survey. Verify current versions and recommendations during planning.

### Agent discretion
- Use standard, mature technical patterns within the approved product boundaries. Research current Clerk/NestJS integration and applicable database/provider details; do not silently change the identity provider, role model, deletion semantics, or approved stack.
- Design implementation details for staged closure (including states/authorization) during research/planning, but preserve the product outcomes above and escalate any legal/privacy policy decision that cannot be resolved from project context.

### Owner Resolution (2026-11-17) — binding on downstream implementation

The owner answered the two blocking questions escalated by Plan 01-03. These selections are binding on Plans 01-04, 01-06, 01-07 and 01-08 and do not change D-01 through D-11. Exact lifecycle state names, closure authorization/reopen rules and retention periods were explicitly delegated to downstream research/planning; no legal retention duration or state name is invented here.

#### Merchant-obligation deletion behavior — `staged-closure` (owner selection, 2026-11-17)
- Applies to the locked outcomes D-07, D-08 and D-09: anonymize personal data; never cascade-delete records needed for orders/audit; do not leave a closed merchant's products selling indefinitely; do not strand in-flight orders/refunds.
- The signed-in account owner (the user) may request closure.
- On accepted closure: stop new sales; retain store, merchant and order records; allow only restricted completion/refund actions until outstanding obligations resolve.
- Final anonymization of personal data is permitted **only when outstanding obligations are resolved** (D-08), subject to legally required retention. This is the sole anonymization trigger for this identity lifecycle and is not a general product-policy rule.
- Implementation constraint: Plans 01-04 (schema) and 01-08 (deletion/closure implementation) design the exact lifecycle states, who may authorize/reopen closure, and the obligation-resolution mechanism under these locked outcomes. Downstream plans record those details; this resolution does not preselect state names, authority rules or a legal retention period.

#### Tombstone form, retention and Clerk session revocation — `keyed-permanent-tombstone-local-first` (owner selection, 2026-11-17)
- Owner delegated the choice as standard industry practice; this is the selected standard.
- **Form:** keyed pseudonymous tombstone — e.g. HMAC of the Clerk external subject (`sub`) with a server-side secret. No raw Clerk subject, email or other raw identifier is retained; the marker is irreversible and cannot be read to learn the person's identity. This preserves the D-07 anonymization intent.
- **Retention:** permanent/indefinite deny marker — standard industry practice to prevent re-provisioning after permanent account deletion. No legal retention duration was supplied or invented.
- **Sequence (local-first):** the local tombstone is written in the same local transaction as anonymization, so the deleted subject is denied re-provisioning immediately. Clerk provider revocation is attempted after/alongside the local transaction with retry; the local tombstone is authoritative.
- **Failure behavior (fail closed):** if the Clerk provider revocation call fails, the person remains locked out locally. The failure must be surfaced and retried and must never restore local access; provider failure must not roll back or reverse the already-committed local anonymization/tombstone.
- Implementation constraint: the verification guard (Plans 01-06/01-07) consults the tombstone and denies deleted subjects; Plan 01-08 implements the fail-closed local-first transaction and retry/reporting for provider revocation; Plan 01-04 supplies durable storage for the keyed marker plus the server-side secret. Session-revocation assumptions are documented in `01-RESEARCH.md` and constrained here.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Product scope, decisions, and requirements
- `master-document.md` — product vision, identity boundary, monolith scope, and owner decision context.
- `.planning/PROJECT.md` — approved stack direction, identity and authorization constraints, project decisions, and zero-spend/product context.
- `.planning/REQUIREMENTS.md` — AUTH-01..06, OPS-01/03/05, gallery requirements GALL-06, and stated account-deletion behavior.
- `.planning/ROADMAP.md` — Phase 1 goal, success criteria, mandated backend-first sequence, and the later merchant gallery/picker scope.
- `GSD_WORKFLOW.md` — implementation sequencing and owner decision boundaries, especially security/privacy and data-retention decisions.

### Stack and architecture research
- `.planning/research/STACK.md` — current stack research and provisional Prisma recommendation/version caveats; re-verify during planning.
- `.planning/research/SUMMARY.md` — existing research conclusions, phase flags, and research gaps.
- `.planning/research/ARCHITECTURE.md` — proposed module boundaries and current Prisma-shaped architecture; treat as research, not as an ORM lock.

### External ORM references considered during discussion
- `https://mikro-orm.io/docs/usage-with-nestjs` — official MikroORM NestJS integration and request context.
- `https://mikro-orm.io/docs/unit-of-work` — official Unit of Work and transaction behavior.
- `https://mikro-orm.io/docs/identity-map` — official identity-map/request isolation guidance.
- `https://docs.nestjs.com/data/mikroorm` — NestJS documentation for MikroORM integration.
- `https://docs.nestjs.com/data/prisma` — NestJS documentation for Prisma provider integration.
- `https://www.prisma.io/docs/guides/frameworks/nestjs` — Prisma's NestJS guide; current version and details must be verified during research.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- None. The repository is deliberately unscaffolded and contains planning/project documentation only.

### Established Patterns
- No application patterns exist yet. Follow approved project direction: TypeScript monorepo, NestJS API, PostgreSQL, Clerk identity, server-enforced authorization, Docker Compose local environment, Pino logging, and Vite+ as unified repo toolchain, subject to focused verification during planning.

### Integration Points
- Phase 1 establishes the API application and database foundation that later backend phases extend. The later Next.js UI consumes identity through Clerk and the API contract; it is not part of this phase's implementation.
- Local user provisioning must connect a verified Clerk session to a stable Clerk user ID and database record without webhooks.
- Merchant closure must preserve references needed by later store, order, payment/refund, and seller-authorization modules.

</code_context>

<specifics>
## Specific Ideas

- Merchant image gallery selection should expose the same search/filter dimensions available to admins: **name, category, and tags**. This clarifies GALL-06 for its owning picker/UI phases; it does not expand Phase 1 scope.
- The ORM question is important enough for a short, criteria-bounded check now, but not an open-ended comparison exercise. Prisma has a research head start, not an automatic decision.
- User emphasized that merchant deletion is consequential because orders, payments/refunds, and fulfillment may be in progress; avoid treating deletion as a simple immediate store deactivation.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within existing Phase 1 identity decisions and clarified an existing later-phase gallery-picker requirement.

</deferred>

---

*Phase: 1-platform-foundation-identity*
*Context gathered: 2026-11-16*
