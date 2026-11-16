# ecom-v1 — Agent instructions

Use the relevant project documents below as context; their contents can become stale. If documents disagree, conflict with verified behaviour, or leave a consequential decision unclear, ask the owner rather than assuming one source automatically wins. Record the owner's resolution in the affected documents.

## Where things live

| Task | Document |
|---|---|
| Product requirements, scope, stages, project identity | `master-document.md`, `.planning/PROJECT.md` — consult the owner if they disagree |
| Commit, branch, merge, worktree | `GIT_CONVENTIONS.md`, `GIT_WORKFLOW.md` |
| Application code, API, schema, logging, code quality | `CODING_CONVENTIONS.md` |
| Writing or fixing tests | `TESTING_CONVENTIONS.md` |
| GSD planning, execution, reporting, decision authority | `GSD_WORKFLOW.md` |
| Codebase mapping (Graphify) | `GRAPHIFY.md` |

## Context efficiency

- Inspect narrowly: symbol/reference search, relevant line ranges, focused snippets first.
- Read a whole file when it is small, or when behaviour depends on its full dependencies, invariants or side effects.
- Never dump lockfiles, generated output, dependency directories or build artefacts into the conversation.
- Keep agent/model/tool usage economical; avoid redundant parallel runs and repeated research.

Keep this file concise. Procedures belong in those documents; add a reference here rather than expanding it.

<!-- GSD:project-start source:PROJECT.md -->
## Project

Read `.planning/PROJECT.md` for the project summary, requirements and decisions; consult `master-document.md` for relevant product context. These are references, not precedence rules.

<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

Read `.planning/research/STACK.md` for current stack research. Verify time-sensitive versions and recommendations before relying on them.

<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.

<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture is not yet mapped. Follow existing patterns found in the codebase; consult `.planning/research/ARCHITECTURE.md` for any current research and verify it against implementation.

<!-- GSD:architecture-end -->

## Project Skills

Project-specific OpenCode skills belong in `.opencode/skills/<skill-id>/SKILL.md`. None are currently present.

<!-- GSD:workflow-start source:GSD defaults -->

## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:

- `/gsd:quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd:debug` for investigation and bug fixing
- `/gsd:execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->
