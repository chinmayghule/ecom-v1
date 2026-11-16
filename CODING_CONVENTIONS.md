# Coding Conventions

Practical standards for the approved ecom-v1 stack: TypeScript, Next.js 16,
NestJS 12, PostgreSQL, Clerk, OpenAPI, Pino, orchestrated by Vite+.

This document does not choose technology. New frameworks, ORMs, state managers or
infrastructure belong in `master-document.md` first.

## Repository organisation

- Monorepo with the web app, the API, and **only justified** shared packages.
- A shared package needs two real consumers and a stable boundary. "It might be
  reused" is not a reason.
- Boundaries follow domains, not layers: a package extracted for `catalogue` or
  `orders` is defensible; a generic `utils` package is not.
- Application build systems stay framework-native (Next.js and NestJS build
  themselves); Vite+ orchestrates format, lint, test and hooks around them.

Exact package names and directory layout do not exist yet. Do not document or
assume them before scaffolding creates them.

## TypeScript

- `strict` is on. Do not weaken it to avoid fixing types; `// @ts-expect-error`
  needs a comment stating why.
- No `any` in application code. Use `unknown` at trust boundaries and narrow it.
- Model states as discriminated unions, not optional-field soup. An order that is
  either cancelled or shipped is a union; a status string that a hundred `if`s
  re-check is not.
- Prefer `readonly` and `as const` for fixed tables. Derive types from a single
  definition (`typeof`, `keyof`, `satisfies`) instead of restating shapes.
- Validate external data at the boundary; inside the system, rely on the types.
- Keep `null` and `undefined` meaning different things, or use one consistently
  per module.

## Naming and files

- Follow framework conventions over personal preference. NestJS: `*.module.ts`,
  `*.controller.ts`, `*.service.ts`, `*.dto.ts`. React: PascalCase component
  files. PostgreSQL: `snake_case` identifiers.
- Values and functions `camelCase`, types and classes `PascalCase`, constants
  `SCREAMING_SNAKE_CASE` only for genuine constants.
- Name by domain intent: `placeOrder`, `applyInventoryAdjustment`. Avoid
  `processData`, `handleThing`, `utils`, `helper`.
- One public export per file where practical; keep a file's name matching its
  main export.

## Architecture and modularity

- NestJS: thin controllers, business rules in services, persistence in a
  repository/data-access layer. Controllers translate HTTP; they do not decide
  authorization or totals.
- Keep domain modules independent. Cross-module calls go through a service
  interface, not by reaching into another module's repository.
- **No premature abstraction.** Introduce an interface or base class at the
  third concrete duplication, not the first. Generic `BaseRepository` /
  `BaseService` hierarchies are rejected by default: they hide the SQL and the
  rules that matter.
- Prefer explicit, slightly repetitive code over a configuration-driven
  abstraction that only its author understands.
- Delete dead code. Do not leave commented-out implementations or unused exports.

## Validation and error handling

- Validate every external input at the boundary: HTTP body, query, params, and
  any third-party response. Reject unknown fields rather than silently ignoring
  them.
- Authorization and resource ownership are backend concerns, enforced in the
  service/query. A hidden frontend control is a usability measure, never a
  security boundary.
- Purchase-critical values (prices, totals, stock, ownership) are derived on the
  server. Never trust a client-submitted amount.
- Use a consistent error shape and correct status codes: 400 malformed input,
  401 unauthenticated, 403 authenticated but not permitted, 404 absent or not
  visible to this caller, 409 conflict/invariant violation, 5xx genuine faults.
- Do not leak stack traces, SQL, provider errors or internal identifiers to
  clients. Log the detail server-side.
- Distinguish "failed" from "unknown outcome". A payment timeout is unknown: do
  not mark the order failed and do not retry blindly.

## Dependencies

- Prefer mature, maintained packages with a compatible licence and a real
  release history. Check the maintenance date, not just the download count.
- No two libraries for one job. Pick one and remove the other.
- Do not add a dependency for a few lines of code you can read and test.
- Adding a dependency that introduces a paid tier, telemetry or an account is an
  owner decision.
- Remove unused dependencies in the same change that makes them unused.

## API design and contract

- OpenAPI is the single contract source. Generate the client from it; do not
  hand-write a parallel set of types in the frontend.
- Resources and verbs follow HTTP conventions; plural nouns, no verbs in paths.
- List endpoints paginate by default and state their ordering. Unbounded lists
  are a defect.
- Every response that the frontend consumes is typed from the contract. A
  mismatch between contract and implementation is a bug in whichever is wrong —
  fix both, do not cast.
- Keep backward compatibility once deployed. Additive changes first; a breaking
  change needs `!` and a migration note (see `GIT_CONVENTIONS.md`).

## Database and migrations

- Schema changes go through versioned migrations. Never enable schema
  auto-synchronisation, including "just for local development".
- A migration that has been applied anywhere shared is immutable. Fix forward
  with a new migration.
- Put invariants in the database: foreign keys, unique constraints, checks,
  `NOT NULL`. Application checks alone do not survive concurrent requests.
- Multi-row invariants that must hold together use a transaction; state the
  isolation expectation when it matters.
- Avoid `SELECT *` in application queries. Select what the endpoint needs.
- Do not add speculative indexes. Add one when a query plan or measurement
  justifies it, and record the reason in the migration or Stage 2 notes.
- Name migrations for the change, not the timestamp.

## Logging and observability

- Pino structured logs with stable field names (`requestId`, `userId`,
  `orderId`, `outcome`). Do not log prose only.
- Never log secrets, tokens, full request bodies that may contain credentials,
  or any card data. The mock payment service must not collect or store card data
  at all.
- Log outcomes and decisions, not every function entry.
- Distinguish confirmed failure from unknown outcome in both the log fields and
  the API response.
- Health endpoints should report real dependency state, not a constant 200.

## Maintainability

- Optimise for the next reader, who has the master document but not this
  conversation.
- Comment the *why* and the non-obvious constraint; let the code state the what.
- Keep functions at one level of abstraction. A controller that builds SQL is a
  layering defect.
- Prefer boring solutions. No caching layer, queue, event bus, CQRS split or
  abstraction layer without a measured or contracted reason.
- When you find a code smell or a security problem, say so with its consequence
  and the alternative — do not silently rewrite adjacent code.
