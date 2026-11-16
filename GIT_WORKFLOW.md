# Git Workflow

Branch lifecycle, review, merging and worktrees. Message format and branch
naming are in `GIT_CONVENTIONS.md`.

## Verified repository state

Checked 2026-11-16 against `chinmayghule/ecom-v1`:

- `main` is the only branch; there is no `dev`, `staging` or release branch.
- `main` has **no branch protection and no rulesets**.
- All three merge methods are enabled; delete-branch-on-merge is off.
- GitHub Actions is enabled, but no workflow exists yet.

Everything below is the intended process, not a description of enforced
settings. If a rule matters, it must be enforced by the owner in GitHub — this
document cannot enforce it. Do not cite protection that does not exist.

## Branch model

**Trunk-based with short-lived branches, aimed at `main`.**

```
feature/<NN>-<slug>  ─┐
fix/<slug>            ├─ PR ─→ main
docs/<slug>          ─┘
```

- `main` is always runnable and is what any deployment reads.
- Branches are created from current `main` when work starts and are short-lived.
- ecom-v0 used a long-lived `dev` integration branch. That is **not** carried
  over: it existed to absorb a high volume of concurrent agent work, and it
  added a promotion step that v0's own history shows went wrong twice. Revisit
  only if two streams of work genuinely need to integrate before `main`.
- Adding a long-lived branch is an architectural/process decision. Raise it
  rather than introducing one quietly.

## Pull requests

- One GSD phase or one discrete fix per PR. Do not mix refactors, formatting and
  behaviour changes.
- Open the PR when the work is reviewable — not as a progress marker.
- The description states: what changed, how it was verified (commands actually
  run and their result), known limitations, and any deviation from the phase plan.
- Start agent-authored descriptions with `[AI]`.
- A PR is not "ready" while its own verification is failing, even if the failure
  is unrelated and pre-existing — report the failure explicitly instead.

## Review and approval

- The owner reviews the diff before it lands on `main`. An agent-authored PR is
  not self-reviewed.
- **Wait for an explicit instruction to merge.** Approval in conversation is the
  approval record; nothing in the repository or GitHub records it today.
- GitHub rejects self-approval (`422 Review Can not approve your own pull
  request`), so required approvals are not a usable gate in a single-reviewer
  repository. Do not respond by merging without review — that removes the only
  gate there is.
- An agent may push to its own branch. It must not push to `main`.

## Merging

- Default: **rebase and merge**, so `main` keeps a linear history and commits
  stay individually traceable.
- Squash is acceptable for a branch whose intermediate commits are noise; the
  commit that lands must still follow `GIT_CONVENTIONS.md`.
- Merge commits are not the default on branch → `main`. They are only needed if a
  long-lived branch is introduced later.
- Never force-push `main` or any shared branch. Force-push your own unpublished
  branch only with `--force-with-lease`, and never after review has started
  without saying so.
- Never delete a remote branch that contains unmerged work.

## Worktrees

Use a worktree when it buys isolation, not by default.

**Use one when:**

- Two or more code-modifying tasks run concurrently.
- A task needs a working branch checked out while `main` (or another branch)
  must stay usable in the canonical checkout.
- A long-running build or test run would otherwise be disturbed by a branch switch.

**Do not use one when:**

- Work is sequential — one branch at a time in the canonical checkout is simpler.
- The task is read-only research, exploration or review. Read-only agents share
  the canonical checkout.

Place worktrees outside the canonical directory (a sibling directory is fine) so
build output and tooling state stay separate:

```sh
git worktree add ../ecom-v1-<slug> -b feature/<NN>-<slug> main
git worktree list
```

Rules:

- **One implementing agent per worktree.** Never let two agents modify the same
  working tree, including the canonical one.
- A worktree owns its branch; do not check out the same branch in two worktrees.
- Copy or link environment files deliberately; never commit or symlink secrets
  between them.
- Before removing: confirm the branch is merged or its commits are pushed and the
  tree is clean. `git worktree remove <path>` refuses dirty trees — do not reach
  for `--force` to get past that. If unmerged work must be discarded, that is an
  owner decision.
- Prune stale metadata with `git worktree prune` after a worktree is deleted by hand.

## Concurrency

- `.planning/` (roadmap, state, plans) is shared repository state, not per-branch
  scratch. Run GSD planning and execution **one phase at a time**; never run two
  phases that would rewrite shared planning files concurrently.
- Parallel *research* is fine and does not need worktrees.
- Parallel *implementation* requires separate worktrees and disjoint file sets.
  Two agents editing the same module on different branches will still produce
  conflicting contracts; sequence them instead.

## Planning state must stay tracked

`.planning/` is committed and must never be added to `.gitignore`. An ignored
directory is unprotected: `git reset --hard`, `git clean -fd` or a fresh clone
removes it with no recovery path. v0 lost planning state this way.

## Before every commit

1. Run the checks that exist at that point (format, lint, typecheck, tests — see
   `TESTING_CONVENTIONS.md`).
2. Stage explicitly. Read `git diff --staged` before committing; it is the last
   point where a stray file or secret can be caught.
3. Never commit to make a tree clean. If a file is unrelated, leave it unstaged.

No pre-commit hook exists yet. Until one is configured, step 2 is manual and is
not optional.
