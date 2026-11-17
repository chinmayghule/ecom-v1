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

Read `CODING_CONVENTIONS.md` at the repository root for engineering conventions.

<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture is not yet mapped. Follow existing patterns found in the codebase; consult `.planning/research/ARCHITECTURE.md` for any current research and verify it against implementation.

<!-- GSD:architecture-end -->

<!-- GSD:workflow-start source:GSD defaults -->

## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:

- `/gsd:quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd:debug` for investigation and bug fixing
- `/gsd:execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->
