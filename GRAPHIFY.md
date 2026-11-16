# Graphify — project usage

Operational rules for the Graphify codebase-mapping tool on ecom-v1.
Referenced from `AGENTS.md`; keep tool procedure here, not in AGENTS.md.

- Skill is installed globally (`~/.config/opencode/skills/graphify/`); invoke `/graphify` to build, with `--no-viz` as the project default.
- Output lives in `graphify-out/`, which is gitignored. If `graphify-out/GRAPH_REPORT.md` exists, read it before architecture questions and prefer `graphify query` / `path` / `explain` over grep for cross-module questions. Verify findings against source.
- Git hooks are local-only (`.git/hooks`, not tracked). On a fresh clone run `graphify hook install`; after code changes run `graphify update .` (AST-only, no LLM cost).
- Do not generate, open or commit `graph.html` — the visual page is not used. Never add `graphify-out/` to git.
