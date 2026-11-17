# ecom-v1 — Agent instructions

Use the relevant project documents below as context; their contents can become stale. If documents disagree, conflict with verified behaviour, or leave a consequential decision unclear, ask the owner rather than assuming one source automatically wins. Record the owner's resolution in the affected documents.

## Explaining problems

When describing a problem, failure or blocker: use plain, direct language without
dumbing it down; include the details needed to understand and act on it; skip
niche package names, settings and implementation trivia unless asked or essential.

## Where things live

| Task | Document |
|---|---|
| Commit, branch, merge, worktree | `GIT_CONVENTIONS.md`, `GIT_WORKFLOW.md` |
| Writing or fixing tests | `TESTING_CONVENTIONS.md` |
| GSD planning, execution, reporting, decision authority | `GSD_WORKFLOW.md` |
| Codebase mapping (Graphify) | `GRAPHIFY.md` |

## Context efficiency

- Inspect narrowly: symbol/reference search, relevant line ranges, focused snippets first.
- Read a whole file when it is small, or when behaviour depends on its full dependencies, invariants or side effects.
- Never dump lockfiles, generated output, dependency directories or build artefacts into the conversation.
- Keep agent/model/tool usage economical; avoid redundant parallel runs and repeated research.

Keep this file concise. Procedures belong in those documents; add a reference here rather than expanding it.

## Project Skills

Project-specific OpenCode skills belong in `.opencode/skills/<skill-id>/SKILL.md`. None are currently present.
