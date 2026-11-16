# Phase 1: Platform Foundation & Identity - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-16
**Phase:** 1-Platform Foundation & Identity
**Areas discussed:** Identity sync, Role combinations, Merchant account deletion and closure, ORM selection, Merchant gallery search and filters

---

## Identity sync

| Option | Description | Selected |
|--------|-------------|----------|
| First-sign-in snapshot | Keep profile values as captured when the local record is created | |
| Refresh verified copies | Use immutable Clerk user ID as local identity key; refresh email/username copies from verified Clerk profile on sign-in | ✓ |
| Add profile-change workflow | Build an application-managed email/profile change feature | |

**User's choice:** Clerk user ID is the stable unique identifier. Clerk owns email/password credentials; local records keep email and a required, non-unique username/display name. No in-app email-change flow is in scope. The user approved verified-profile copy refresh on sign-in and the allowlist only bootstrapping admin capability.
**Notes:** Email is mutable and must not identify ownership or create a second local account. Admin capability must not silently change when email changes.

---

## Role combinations

| Option | Description | Selected |
|--------|-------------|----------|
| Additive capabilities | Customer baseline; merchant added after onboarding; admin is a separate privileged capability and can coexist with customer use | ✓ |
| Exclusive account types | Customer, merchant, and admin are mutually exclusive | |

**User's choice:** Additive capabilities with a separate admin privilege.
**Notes:** Backend authorization checks the required capability for each action/resource.

---

## Merchant account deletion and closure

| Option | Description | Selected |
|--------|-------------|----------|
| Immediate deactivation | Immediately unpublish products and disable the merchant account | |
| Keep selling after deletion | Retain active products under an anonymized owner | |
| Require ownership transfer | Add a transfer flow before deletion | |
| Staged closure | Stop new sales, retain records, permit restricted completion of obligations, then anonymize when resolved | ✓ |

**User's choice:** Staged closure.
**Notes:** User highlighted parallel in-flight activity (purchase, payment, refund, shipment, possible reviews) and the gravity of merchant deletion. Preserve merchant/store/order records; stop new sales, but permit only the restricted actions needed to finish outstanding orders and resolve payment/refund work. Anonymize personal data when obligations resolve, subject to required retention. Do not invent legal retention rules; research/planning must identify policy uncertainty.

---

## ORM selection

| Option | Description | Selected |
|--------|-------------|----------|
| Lock Prisma | Use the current project-specific researched baseline without more comparison | |
| Lock MikroORM | Use its Data Mapper/Unit of Work and official NestJS integration | |
| Bounded comparison gate | Prisma is provisional; compare Prisma and MikroORM on project-critical criteria before implementation | ✓ |

**User's choice:** Bounded comparison gate.
**Notes:** As project lead, recommended focused research now because ORM choice affects the database foundation and is least expensive to compare before scaffolding. Prisma's prior research reduces effort but is not proof of preference. Compare PostgreSQL migrations, NestJS integration, transactions/conditional updates, pooling, and maintenance/version stability. Use Prisma if MikroORM shows no concrete advantage; do not expand into an all-ORM survey.

---

## Merchant gallery search and filters

| Option | Description | Selected |
|--------|-------------|----------|
| Name/category/tags parity | Give merchants the same gallery search and filter dimensions as admins | ✓ |

**User's choice:** Merchant gallery selection supports all existing gallery search/filter options.
**Notes:** Specifically name, category, and tags. This is clarification of existing GALL-06 for the later picker/UI phase, not new Phase 1 functionality.

---

## The agent's Discretion

- Research implementation patterns and current versions within the approved identity and stack boundaries.
- Downstream research/planning may design the staged-closure state mechanics, but may not change its product outcomes. Escalate unresolved legal/privacy retention policy rather than assuming.
- Routine technical decisions should use standard mature practices; no additional product defaults were locked beyond the choices explicitly approved by the user.

## Deferred Ideas

None.
