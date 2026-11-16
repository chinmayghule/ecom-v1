# AGENTS.md

Project instructions for OpenCode and GSD agents working on **ecom-v1**.

## Project identity

Portfolio-scale, marketplace-lite e-commerce app: customers, self-service merchants, and a minimum platform-admin capability. Stages 1 (monolith) and 2 (hardened monolith) are mandatory; Stages 3–5 and the AI extension are optional and not prerequisites for completion.

## Sources of truth

Resolve questions in this order:

1. `master-document.md` — approved product requirements, scope, technology direction, constraints, stages. Authoritative.
2. `.planning/` — GSD plans, roadmap, state and verification evidence.
3. The codebase and verified behaviour.
4. Supporting engineering conventions (see "Detailed conventions").

Rules:

- Do not silently override an approved master-document decision. Raise material conflicts with the owner.
- Verified code does not automatically become the requirement: an unapproved deviation is a defect to raise, not a new baseline.
- **Stage ≠ GSD phase.** Stage 1–5 are long-term deliverables; GSD phases are implementation-sized units in `.planning/`. Never conflate or renumber across them.

## Repository state

Deliberately unscaffolded: the repository holds only documentation, this file, `.gitignore` and the Graphify plugin. There are **no apps, packages, manifests, lockfiles, CI or scripts yet**.

- Do not invent commands, directory layouts, package names or build steps. Verify before documenting.
- Do not scaffold or install dependencies unless a plan explicitly calls for it.

## GSD working relationship

GSD is the primary engineering team, not a code generator awaiting instructions. The owner should not have to supervise routine technical work.

Act independently on:

- Conventional, reversible technical decisions.
- Research of unfamiliar technology, using authoritative/current documentation.
- Choosing mature, well-maintained packages over custom implementations.
- Recording assumptions and unresolved decisions.

Do not re-ask what project documentation already answers. Explain material trade-offs.

**Escalate before acting** on:

- Ambiguous product or business rules.
- Security, privacy or data-integrity implications.
- Expensive or hard-to-reverse architectural choices.
- Changes to approved scope or technology decisions.
- Destructive operations or consequential Git/database actions.
- New paid services, subscriptions or spending exposure.

Escalations state the issue, its consequences, the recommended choice and the alternatives. Continue safe independent work meanwhile; record non-blocking issues for later review. Never conceal failing tests or present incomplete work as complete.

## Implementation order

**Backend → Frontend → Integration → Deployment.** No feature-by-feature vertical slices.

- Backend is a coherent, tested subsystem before substantial frontend work starts.
- Backend planning must still model the customer and merchant journeys so API contracts serve their real consumers.
- Frontend builds against established backend contracts and the generated API client — not against speculative endpoints.
- Test each subsystem during its own implementation; end-to-end journey verification comes after both exist.
- Planning both subsystems up front is allowed; executing the frontend early is not.

Phase lifecycle and decision authority: `GSD_WORKFLOW.md`.

## Engineering quality

Require type-safe, secure, maintainable code. Prefer the smallest correct workflow.

Avoid: premature abstraction, speculative scaling, unnecessary or duplicate dependencies, unapproved deviations, and throwaway compatibility projects for mature packages.

Flag security problems, poor practices and significant code smells with their consequences and the better alternative. The `master-document.md` constraints are binding: backend authority for authz, ownership and purchase totals; zero-spend hosting; no real card data in the mock payment path.

Code changes: `CODING_CONVENTIONS.md`. Tests: `TESTING_CONVENTIONS.md`.

## Git and worktrees

- Worktrees isolate concurrent or parallel code-modifying tasks. **Never let two implementation agents modify the same working tree.**
- No worktree for read-only research or ordinary sequential work.
- Never force-push, delete remote branches, or perform destructive/consequential Git operations without owner approval.
- Branch from `main`; it is the only branch and is currently unprotected. No CI exists yet, so nothing enforces these rules but review.
- Consult `GIT_CONVENTIONS.md` and `GIT_WORKFLOW.md` before any commit, branch, merge, or worktree operation.

## Context efficiency

- Inspect narrowly: symbol/reference search, relevant line ranges, focused snippets first.
- Read a whole file when it is small, or when behaviour depends on its full dependencies, invariants or side effects.
- Never dump lockfiles, generated output, dependency directories or build artefacts into the conversation.
- Once Graphify is installed and its graph exists, use scoped Graphify queries for architecture and impact analysis before broad searches. Graph output is navigation, not proof — verify against source.

## Cost and secrets

- Keep agent/model/tool usage economical; avoid redundant parallel runs and repeated research.
- No paid tier, overage or spending exposure without owner approval.
- Never commit, log or report credentials, API keys or tokens.

## Historical reference

`github.com/chinmayghule/ecom-v0` (`AGENTS.md`, `GIT_CONVENTIONS.md`, `GIT_WORKFLOW.md`, `ecom_project_master.md`) is **historical context only**. Learn from its decisions and mistakes, but do not copy its stack or tooling: v0 used pnpm workspaces, Biome, Lefthook, NestJS 11 and TypeORM. ecom-v1 mandates Vite+, NestJS 12, Next.js 16, and its own Git documentation. Apply v0 conventions only where the current master document does not override them.

## Detailed conventions

Read the relevant document before the task, not after:

| Task | Document |
|---|---|
| Commit, branch, merge, worktree | `GIT_CONVENTIONS.md`, `GIT_WORKFLOW.md` |
| Application code, API, schema, logging | `CODING_CONVENTIONS.md` |
| Writing or fixing tests | `TESTING_CONVENTIONS.md` |
| GSD planning, execution, reporting | `GSD_WORKFLOW.md` |

Keep this file concise. Procedures belong in those documents; add a reference here rather than expanding this file.

## graphify

- Skill is installed globally (`~/.config/opencode/skills/graphify/`); invoke `/graphify` to build, with `--no-viz` as the project default.
- Output lives in `graphify-out/`, which is gitignored. If `graphify-out/GRAPH_REPORT.md` exists, read it before architecture questions and prefer `graphify query` / `path` / `explain` over grep for cross-module questions. Verify findings against source.
- Git hooks are local-only (`.git/hooks`, not tracked). On a fresh clone run `graphify hook install`; after code changes run `graphify update .` (AST-only, no LLM cost).
- Do not generate, open or commit `graph.html` — the visual page is not used. Never add `graphify-out/` to git.
