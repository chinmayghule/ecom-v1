# ecom-v1

A portfolio-scale, marketplace-lite e-commerce application. Independent merchants
sell through a shared storefront, customers discover products and complete a
simulated purchase, and platform administrators provide minimal oversight. The
aim is to demonstrate end-to-end engineering quality — design, build, test,
deploy, operate and explain — not to become an enterprise marketplace.

## Status

Stage 1 (the core marketplace) is in progress. Phase 01 — platform foundation and
identity — is implemented and verified; the remaining phases are planned in
`.planning/ROADMAP.md`. See `.planning/STATE.md` for the current position.

## Stack

- **Web:** Next.js 16 and TypeScript, orchestrated by Vite+
- **API:** NestJS 12, PostgreSQL, Prisma, Clerk authentication, Pino logging
- **Contract:** OpenAPI as the single source of truth, with a generated client
- **Local development and CI:** Docker Compose and GitHub Actions

## Getting started

Setup, environment variables and local commands are documented in
`docs/operations/local-development.md`. Once dependencies are installed,
`pnpm run verify:phase-01` runs the same checks locally that CI runs.

## Documentation

| Topic | Where |
|---|---|
| Product scope, stages and decisions | `master-document.md` |
| Project context and requirements | `.planning/PROJECT.md`, `.planning/REQUIREMENTS.md` |
| Roadmap and current state | `.planning/ROADMAP.md`, `.planning/STATE.md` |
| Engineering conventions | `CODING_CONVENTIONS.md`, `TESTING_CONVENTIONS.md`, `GIT_CONVENTIONS.md`, `GIT_WORKFLOW.md`, `GSD_WORKFLOW.md` |
| Architecture and verification evidence | `docs/architecture/`, `docs/verification/` |

## Testing

See `TESTING_CONVENTIONS.md` for what is tested at each level and what "passing"
means. The local gate (`pnpm run verify:phase-01`) and the CI workflow run the
same checks.

## License

MIT — see `LICENSE`.
