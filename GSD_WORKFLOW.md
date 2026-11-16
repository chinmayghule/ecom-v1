# GSD Workflow

How GSD operates on ecom-v1: implementation sequence, decision authority,
recording practice and reporting.

GSD is the primary engineering team, not a code generator awaiting instructions;
the owner should not have to supervise routine technical work. This document
covers *how* work is sequenced and governed; it does not restate requirements.

## Conflicting or stale context

Project documents, plans and the codebase can each be incomplete or out of date;
do not assume that one automatically overrides the others. Check relevant sources
and verified behaviour. If a material conflict or consequential uncertainty
remains, ask the owner instead of choosing silently, then record the resolution
where future work will find it.

Do not scaffold or install dependencies unless a plan explicitly calls for it;
do not invent commands, directory layouts or package names.

## Implementation sequence

**Backend → Frontend → Integration → Deployment.** No vertical slices.

1. **Plan freely, execute in order.** Research and plan the whole application —
   including intended frontend workflows, screens and states — before backend
   implementation starts. Planning ahead is encouraged; *building* ahead is not.
2. **Backend first.** Build it as a coherent subsystem: schema and migrations,
   Clerk integration and local user provisioning, authorization and ownership,
   business rules, APIs, the OpenAPI contract, tests, and the backend's own
   documentation. Backend planning must model the customer and merchant journeys
   so the contracts serve their real consumers rather than an abstract data model.
3. **Frontend second.** Build against the established contract and generated API
   client. A missing or wrong endpoint is a backend change, not a reason to
   hand-write types or mock around it.
4. **Integration third.** Wire the two subsystems together and verify complete
   user journeys end to end, including the mock-payment outcomes.
5. **Deployment last.** Hosting, pipeline, observability and operational
   evidence follow a working integrated system.

**"Backend sufficiently complete" means:** the OpenAPI contract covers the agreed
Stage 1 journeys; migrations apply and revert cleanly on an empty database;
authentication and every ownership rule are enforced server-side; purchase-critical
calculations are server-derived; API and integration tests pass; and the seed data
lets a reviewer exercise those endpoints. Anything less leaves the frontend
building on sand.

Testing is continuous within each subsystem. The integration stage verifies
boundaries; it is not where subsystem correctness is discovered.

## Stages and phases

- **Stages** (1–5) are the project's long-term deliverables. If project records
  disagree about them, consult the owner rather than assuming one record wins.
- **GSD phases** are implementation-sized units in `.planning/`, re-derived as
  work is discovered.
- A phase always belongs to exactly one stage. Phase numbering restarts per
  stage or continues globally — follow what `.planning/ROADMAP.md` actually uses;
  never renumber by assumption.
- Never use "phase" to mean a stage or "stage" to mean a phase in plans, commits,
  branches or reports.

## Phase lifecycle

```
discover → plan → execute → verify → land (commit / PR) → record
```

- One phase executes at a time. `.planning/` (roadmap, state, plans) is shared
  state; concurrent phases corrupt it and produce contradictory plans.
- The branch for a phase is `feature/<NN>-<slug>` (see `GIT_CONVENTIONS.md`),
  created from current `main` before planning.
- A phase is not complete because its tasks are ticked. It is complete when its
  stated outcome is verified — by a command, a test, or a reproducible check —
  and the evidence is recorded.
- Do not start the next phase to avoid a failing verification in the current one.

## Decision authority

**Decide autonomously:** library choice within the approved stack for a
well-understood need; internal module boundaries; naming; test structure; query
and index design that is measured; error-shape details; local tooling; provider
choice within an explicit zero-spend envelope; research of unfamiliar technology
using authoritative/current documentation; choosing mature, well-maintained
packages over custom implementations.

**Require owner input:** product or business rules (order states, cancellation,
shipping/total rules, moderation); security or privacy boundaries; data-retention
decisions; anything that changes scope or the approved stack; expensive or
hard-to-reverse architecture; destructive Git or database operations; new paid
services or spending exposure.

When escalating: state the decision needed, its consequences, your recommendation
and the alternatives. Do not present an open question without analysis. Continue
safe independent work while waiting; a blocked decision stops only the work that
depends on it.

Do not re-ask questions that current project documents clearly answer. If an
answer is unclear, inconsistent, or may be stale, check relevant sources and
verified behaviour; ask the owner when the uncertainty is material.

## Recording assumptions and deferred issues

- Assumptions live in the phase plan, not in chat. State them explicitly, with
  the consequence if wrong.
- An unresolved item that does not block current work is recorded where the next
  session will see it — the phase plan's open questions, `STATE.md`, or the issue
  tracker. A decision that only exists in a conversation is lost.
- Never promote an assumption into a requirement silently. Blooming a "default we
  chose" into "the spec" is how scope drifts.
- When the owner decides something that changes a recorded assumption, update the
  record in the same change.

## Technical debt

- Record it with: what is wrong, why it matters, and the trigger that makes it
  worth fixing (a measurement, a phase, a scaling threshold).
- Debt that will block the next phase must be fixed in the current one.
- Debt outside the current phase's scope is recorded, not silently refactored.
  Unrelated cleanup in a phase branch makes the diff unreviewable.
- Do not create debt to save typing: shortcuts in authorization, totals or
  inventory are not acceptable at any stage.

## Reporting progress

Report in three explicit buckets:

- **Done and verified** — with the command or check that proves it.
- **Done but unverified** — and why it could not be verified.
- **Not done / blocked** — with the blocking decision or dependency.

Rules:

- Never describe incomplete work as complete, and never imply a green suite you
  did not run.
- A failing test, a skipped test, or a known broken path is reported in the same
  message as the work, not buried.
- Distinguish "works locally" from "verified in the target environment".
- Summarise; do not paste whole logs. Quote the line that matters.
- Never include credentials, API keys or tokens in reports, logs or commit
  messages.

## Handoff

Leave the repository usable by the next session without the current conversation:

- `.planning/` reflects actual state, including partial work and open questions.
- The working tree is clean, or its uncommitted state is explained.
- Commit messages and the PR description carry the reasoning and the verification
  evidence.
