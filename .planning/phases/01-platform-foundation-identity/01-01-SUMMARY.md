---
phase: 01-platform-foundation-identity
plan: 01
subsystem: infra
tags: [pnpm, corepack, node, dependency-pinning, supply-chain, vitest, legitimacy-gate, prisma, nestjs]

# Dependency graph
requires: []
provides:
  - "DEPENDENCIES.md: complete Phase 1 direct-dependency inventory with exact pins, official sources and researched dispositions"
  - "Attributable owner legitimacy verdict for vitest@5.1.0 (approved) with the historical SUS flag and evidence retained"
  - "Verified toolchain pins (Node 24.22.2, pnpm@11.5.2, Corepack 0.36.0) and a recorded, un-silenced STACK.md pnpm-12 discrepancy"
affects:
  - "01-02 (may install the approved, pinned Vitest/Supertest harness)"
  - "01-03 (separate blocking owner gates remain outstanding)"
  - "All Phase 1 scaffold/CI plans (must respect the inventory and pnpm pin)"
  - "Phase 4 (@hey-api/openapi-ts is explicitly deferred, not in the Phase 1 inventory)"

# Tech tracking
tech-stack:
  added:
    - "Documented pins only (no packages installed): pnpm@11.5.2, Corepack 0.36.0, Node 24.22.2, Prisma 7.10.1, Vitest 5.1.0, NestJS 12, TypeScript 6.0.3, Vite+ 1.6.0"
  patterns:
    - "Every direct dependency inventoried with an exact pin (or an explicit registry-pin instruction), an official source and a researched disposition before any install"
    - "Blocking owner legitimacy gates are explicit, attributable, never auto-approved, and preserve the original SUS evidence"

key-files:
  created:
    - "DEPENDENCIES.md"
    - ".planning/phases/01-platform-foundation-identity/01-01-SUMMARY.md"
  modified: []

key-decisions:
  - "pnpm is pinned to exactly pnpm@11.5.2 via Corepack 0.36.0; the STACK.md 'pnpm 12 workspaces' discrepancy is recorded, not silently resolved, and any pnpm major change is an owner escalation"
  - "vitest@5.1.0 approved by owner after npmjs/GitHub/official-docs verification (2026-11-17); historical SUS flag and evidence retained; install must stay pinned and re-checked against registry metadata"
  - "Plan 01-01 installs no package, manifest, lockfile or source file — the inventory document is its only functional artifact"

patterns-established:
  - "Pre-install dependency inventory as the installation authority for later plans"
  - "Non-auto-approvable, attributable owner verdict for flagged packages with evidence preservation"

requirements-completed: [OPS-05]

# Metrics
duration: 3min
completed: 2026-11-17
---

# Phase 01: Platform Foundation & Identity — Plan 01: Dependency Inventory & Vitest Legitimacy Gate Summary

**Pre-install inventory of every Phase 1 direct dependency with exact pins and official sources, an enforced pnpm@11.5.2/Corepack 0.36.0 toolchain pin, and an attributable owner approval for vitest@5.1.0 with the SUS flag preserved**

## Performance

- **Duration:** 3 min
- **Started:** 2026-11-17T06:27:19Z
- **Completed:** 2026-11-17T06:29:53Z
- **Tasks:** 3 of 3
- **Files modified:** 1 primary (DEPENDENCIES.md) + this summary

## Accomplishments

- Created `DEPENDENCIES.md` (142 lines, above the 25-line minimum) covering every direct dependency of `package.json` and `apps/api/package.json` — API runtime and dev tooling — each with an exact pin or an explicit "pin the registry-resolved version exactly" instruction, an official registry/repository/documentation source, and the researched disposition carried forward from `01-RESEARCH.md`.
- Recorded the verified toolchain first: Node 24.22.2, **pnpm exactly 11.5.2**, **Corepack 0.36.0**, with the mandatory `packageManager: pnpm@11.5.2` rule and the STACK.md "pnpm 12" vs PROJECT.md discrepancy preserved rather than silently resolved.
- Cleared the blocking `checkpoint:decision` gate using the owner's explicit, verified APPROVED verdict (the gate is never auto-approved) and recorded the verdict with date, owner stance and full npm/GitHub verification evidence — while retaining the historical SUS flag, slopcheck warning and threat-register basis.
- Installed nothing: `git status` confirms no package manifest, lockfile, `node_modules`, `apps/` or other source file was created by this plan.

## Task Commits

Each task was committed atomically:

1. **Task 1: Record the foundation dependency and pin set** - `12ee9da` (docs)
2. **Task 2: Owner verdict on the SUS Vitest package before installation** - `fd6601c` (docs — gate-clearance record; Task 2 has `<files>None</files>`, so an empty commit was used to keep an auditable, individually attributed gate record)
3. **Task 3: Record the owner verdict without changing its meaning** - `fdb86f7` (docs)

**Plan metadata:** `PENDING_FINAL_COMMIT` (docs: complete plan)

## Files Created/Modified

- `DEPENDENCIES.md` — authoritative pre-install inventory: toolchain/environment pins and package-manager rule, complete API runtime + dev dependency tables, the Vitest legitimacy gate and owner verdict, explicit Phase 1 exclusions, and provenance notes.
- `.planning/phases/01-platform-foundation-identity/01-01-SUMMARY.md` — this execution summary.

## Decisions Made

- **pnpm pin:** exactly `pnpm@11.5.2`, provisioned by Corepack 0.36.0; never a floating range. The STACK.md "pnpm 12 workspaces" mention conflicts with PROJECT.md's versionless "pnpm workspaces + Corepack `packageManager`"; the environment-verified 11.5.2 is the Phase 1 value and a different pnpm major is an owner escalation (Threat T-01-04). Both versions were re-confirmed in-environment during execution (`pnpm --version` → 11.5.2, `corepack --version` → 0.36.0, `node --version` → v24.22.2).
- **Vitest verdict:** approved by owner after npmjs/GitHub/official-docs verification on 2026-11-17, with `vitest@5.1.0` pinned and to be re-checked against registry metadata at install. The SUS flag is retained as a historical, attributable security record (Threats T-01-02, T-01-SC). `workflow.auto_advance` is false and the gate was not auto-approved.

## Deviations from Plan

No auto-fixed issues — no Rules 1–3 fixes were needed; this documentation-only plan executed as specified.

### Process note: pre-answered blocking gate

- **Task 2** is a `checkpoint:decision` designed to halt execution. The orchestrator supplied the owner's explicit APPROVED verdict (verified against npmjs, GitHub and official docs) before this executor started and instructed that the plan must not pause. The gate was therefore recorded (`fd6601c`) and execution continued. It was never auto-approved by this executor.
- An **empty commit** was used for Task 2 solely to keep an auditable, individually attributed record of the security-gate clearance, because Task 2 declares `<files>None</files>`. No source, manifest or lockfile changes were introduced by it.

**Total deviations:** 0 auto-fixed; 1 process note (pre-answered gate). **Impact on plan:** none — the gate remained explicit, attributable and non-auto-approved, and no installation occurred.

## Issues Encountered

None. The npm/GitHub verification evidence was supplied by the orchestrator on the owner's behalf and was not re-fetched; no install was attempted. All Task 1 and Task 3 grep verifications pass both before and after the verdict update.

## User Setup Required

None — no external service configuration required by this documentation-only plan. (Live Clerk configuration remains a manual, later-phase concern.)

## Next Phase Readiness

- `DEPENDENCIES.md` is the pre-install authority for Plan 01-02; `vitest@5.1.0` is approved for install but only pinned to the exact reviewed version with a registry metadata re-check. Plan 01-01 itself installed nothing.
- Scaffold/CI plans must use the verified pnpm@11.5.2 + Corepack 0.36.0 toolchain and record the `packageManager` field exactly; any pnpm major change must be escalated to the owner.
- Plan 01-03 retains its own separate blocking owner decisions (merchant-obligation deletion, tombstone/privacy retention, Clerk session revocation); this plan did not clear them.
- No stubs or new threat surface were introduced: `DEPENDENCIES.md` documents official sources within the plan's existing trust boundaries (registry → workspace, agent → owner) and adds no network endpoints, auth paths, file access patterns or schema changes.

---
*Phase: 01-platform-foundation-identity*
*Completed: 2026-11-17*
