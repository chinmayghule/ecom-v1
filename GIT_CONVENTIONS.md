# Git Conventions

Commit message format, branch naming, and authorship. Where work goes and how it
lands is in `GIT_WORKFLOW.md`.

## Commit messages

Format: **Conventional Commits** — `<type>(<scope>): <description>`.

```
feat(cart): persist cart items for signed-in customers
fix(auth): reject ownership checks on archived stores
docs: record backend-first implementation order
chore(tooling): add graphify integration
```

Rules:

- Imperative mood: "add", not "added" or "adds".
- Lowercase after the colon, no trailing period.
- One logical change per commit. A commit that needs "and" in its subject is usually two commits.
- The subject states the effect, not the activity. "validate cart totals server-side" beats "work on checkout".
- Explain *why* in the body when the reason is not obvious from the diff. Wrap the body at 72 columns.

### Types

| Type | Use for |
|---|---|
| `feat` | New user-visible capability or endpoint |
| `fix` | A defect fix |
| `refactor` | Code change that alters neither behaviour nor public API |
| `perf` | Measured performance change |
| `test` | Adding or correcting tests only |
| `docs` | Documentation only, including `AGENTS.md` and conventions |
| `build` | Build system, toolchain or dependency-graph changes |
| `ci` | Pipeline configuration |
| `chore` | Tooling, config or maintenance that fits no other type |

`build` and `ci` are separated deliberately: v0 used `chore` for both, which made
pipeline changes indistinguishable from dependency bumps in history.

### Scopes

Use a scope when the change is confined to one workspace package or module — for
example `api`, `web`, `auth`, `catalogue`, `orders`, `db`, `tooling`. Scope names
must match real package or module names once they exist; do not invent names
ahead of the code.

Omit the scope when a change spans packages or is cross-cutting (root config,
repository-wide conventions, dependency bumps).

### Breaking changes

Mark with `!` after the type or scope, and add a `BREAKING CHANGE:` trailer
explaining the migration:

```
feat(api)!: require an Idempotency-Key header on checkout

BREAKING CHANGE: checkout requests without Idempotency-Key now return 400.
```

Before Stage 1 ships there is no external consumer, so breaking changes are
expected. After deployment, treat the published OpenAPI contract as public.

## Branches

Follow **Conventional Branch**: a type prefix, a slash, and a kebab-case
description.

```
feature/merchant-onboarding
fix/duplicate-order-total
chore/bump-dependencies
docs/clarify-inventory-rules
refactor/extract-order-pricing
```

- Types mirror commit types (`feature`, `fix`, `chore`, `docs`, `refactor`, `test`, `perf`).
- No tool-specific prefixes. `gsd/`, `claude/`, `ai/` and similar are not used — authorship is recorded separately (below).
- Branch from the current `main` (see `GIT_WORKFLOW.md`).
- Keep a branch alive only while its work is open; delete local branches after merge.

### GSD phase branches

One GSD phase maps to one branch:

```
feature/<NN>-<slug>
```

`NN` is the two-digit phase number and `<slug>` matches the phase directory in
`.planning/phases/<NN>-<name>/`. The branch name and the phase directory must
agree, so a commit or PR can be traced to exactly one phase.

## Authorship and auditability

Agent-authored **GitHub comments and pull request descriptions** begin with the
`[AI]` prefix:

```
[AI] Reviewed the migration; it applies cleanly to an empty database.
```

This makes machine-authored text identifiable without reconstructing it from
timestamps or wording.

Deliberate difference from v0: `[AI]` is **not** prefixed to commit subjects.
A leading `[AI]` breaks the Conventional Commits parse that changelogs, release
notes and commit linting depend on. Commit authorship is instead established by
the branch, the PR that carries it, and the `[AI]` marker on the PR description.
If commit-level attribution is later required, use a `Co-authored-by:` trailer
rather than editing the subject.

## What must never be committed

- Credentials, API keys, tokens, `.env` contents, or any value from a secret store.
- Generated artefacts: build output, `node_modules/`, coverage reports, `graphify-out/`.
- Local tool state, editor settings, or machine-specific paths.
- Lockfiles are the exception: they are committed, because reproducibility depends on them.

Never rewrite published history or force-push a shared branch; see
`GIT_WORKFLOW.md` for the approval boundary.
