# Testing Conventions

What to test, at which level, and what "passing" means.

Current tooling direction from the master document: Vitest, Supertest, React
Testing Library and Playwright, run through Vite+. **No configuration or commands
exist yet.** Do not cite script names until the workspace defines them; refer to
"the test script configured for that package".

## Test levels

| Level | Scope | Runs against |
|---|---|---|
| Unit | One function, service or pure rule; collaborators mocked | Nothing external |
| Integration | Module + real PostgreSQL: repositories, queries, constraints, transactions, guards | A real database |
| API / contract | HTTP surface through the NestJS app: status codes, validation, authz, response shape | App + database |
| Browser end-to-end | A complete user journey through the UI | Deployed or locally running stack |

Choose the **lowest level that can actually observe the behaviour**. A unit test
with a mocked repository cannot prove a query is correct; an end-to-end test is
too slow to prove every validation branch.

## What belongs where

**Unit:** pricing and total calculation, discount rules, state transitions,
permission predicates, input normalisation, mock-payment outcome mapping.
Anything with branching logic and no I/O.

**Integration (real database):**
- Every query whose correctness depends on SQL semantics: joins, aggregates,
  `ON CONFLICT`, locking, cascade deletes, ordering, pagination.
- Constraints: unique keys, foreign keys, check constraints — prove they actually
  reject the bad row.
- Transaction behaviour: partial failure leaves no half-applied state.
- Authorization filters: a merchant query cannot return another merchant's rows
  even when the caller tampers with an identifier.
- Every migration, applied to an empty database.

**API:** validation rejection, ownership enforcement, authentication failures,
error shape and status codes, idempotency behaviour on repeated requests.

**Browser end-to-end:** the journeys the master document promises — browse,
register/sign in, cart, checkout including the four mock-payment outcomes,
customer order history, merchant catalogue and order management, admin
minimum. Keep this set small and stable; it is the only place full journeys are
proven.

## Organisation and naming

- Co-locate tests with the code they cover, following the framework's convention
  (`*.spec.ts` beside source, `*.e2e-spec.ts` for the HTTP/browser level, or the
  project's established layout once created).
- Test names describe observable behaviour: `rejects checkout when stock is
  insufficient`, not `test order service 3`.
- Structure with arrange/act/assert; one behaviour per test.
- Test files mirror the source path so a failure points at the owner of the bug.

## Test data and isolation

- Each test creates the data it needs and leaves no dependency on execution
  order. Tests must pass individually, in a random order, and in parallel.
- Prefer per-test transactions rolled back at the end, or unique fixtures scoped
  to the test. Do not build one large shared fixture that every test mutates.
- No `sleep`. Wait on a condition or a signal; arbitrary delays are how flakes
  are manufactured.
- Seed/demo data for reviewers is a separate artefact from test fixtures. Do not
  make tests depend on the demo seed.
- Time, randomness and external mock-payment outcomes must be controllable.
  A test that depends on the wall clock or a random outcome is not a test.

## Migrations and schema

- Every migration is verified against an **empty** database, in both directions
  where the tooling supports it (apply, revert, apply).
- A migration is not "tested" because it ran on the developer's already-populated
  database.
- Schema-dependent tests fail loudly if the database is not migrated; they must
  not create tables ad hoc.

## When a test fails

1. Read the full failure, including the assertion diff and the SQL/HTTP error.
2. Reproduce it in isolation before changing anything.
3. Fix the cause. Do not relax the assertion, widen a timeout, add a retry, or
   mark the test skipped to get green.
4. If the failure reveals a real product or contract question, stop and raise it
   rather than encoding an assumption in the test.
5. Re-run the affected suite, then the level above it.

Never report a suite as passing without having run it. Never delete a failing
test without explaining why the behaviour is no longer required.

## Definition of done

A subsystem or slice is not complete until:

- New behaviour has tests at the appropriate level, and existing tests still pass.
- Migration apply/revert has been exercised for schema changes.
- The build and typecheck pass.
- No skipped or `.only` tests are left behind. A deliberate skip carries a
  linked issue and a reason in the code.
- The verification evidence — what was run and the actual result — is recorded in
  the phase's verification artefact, not only in chat.

Coverage percentage is not a target. Untested invariants are the problem;
a high number over trivial code is not a solution.

## Timing

Test continuously inside each subsystem: backend as it is built, frontend as it is
built. The integration stage adds full journeys and cross-boundary checks — it
does not substitute for subsystem tests, and it is not the first time the backend
is exercised.
