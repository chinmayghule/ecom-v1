# Phase 1 Foundation — Direct Dependency Inventory and Exact Pins

This file is the authoritative, pre-install inventory for Phase 1 (Platform
Foundation & Identity). It is derived from the **Package Legitimacy Audit** and
**Standard Stack** sections of
`.planning/phases/01-platform-foundation-identity/01-RESEARCH.md` (researched
2026-11-16) and the toolchain decisions in `.planning/PROJECT.md`.

**Rule:** every package that may appear under `dependencies` or `devDependencies`
in `package.json` or `apps/api/package.json` must be listed here first. A package
that is not in this file may not be installed in Phase 1. No package, manifest,
lockfile or source file was created or installed by plan 01-01 — this document is
the only artifact.

## 1. Toolchain and environment (record before any package install)

| Component | Exact version | Official source | Notes / disposition |
|-----------|---------------|-----------------|---------------------|
| Node.js | 24.22.2 | https://nodejs.org/ ; official repo https://github.com/nodejs/node | Runtime. Verified in this environment via `node --version` (2026-11-16, re-confirmed 2026-11-17). Pin in `.nvmrc`, `engines` and Docker images. |
| pnpm | **exactly 11.5.2** | https://www.npmjs.com/package/pnpm ; official repo https://github.com/pnpm/pnpm ; official docs https://pnpm.io | Verified in this environment via `pnpm --version` (2026-11-16, re-confirmed 2026-11-17). Approved. |
| Corepack | **0.36.0** | https://www.npmjs.com/package/corepack ; official repo https://github.com/nodejs/corepack | Verified in this environment via `corepack --version` (2026-11-16, re-confirmed 2026-11-17). Approved. |
| Docker Compose | v2 (installed 2.36.0-desktop.1) | official docs https://docs.docker.com/compose/ | Local API + PostgreSQL orchestration. [VERIFIED: docker compose version] |
| PostgreSQL (local image) | `postgres:17-alpine` | official image https://hub.docker.com/_/postgres | Local/dev target; confirm pin at scaffold time. [ASSUMED] |

### Package-manager pinning rule (mandatory)

- The root manifest field `packageManager` **must** read exactly `pnpm@11.5.2`.
- **Corepack 0.36.0** provisions that exact pnpm version. Never use a floating
  pnpm range (e.g. `pnpm@^11` or `pnpm@12`) and never install pnpm globally as a
  substitute for the Corepack-managed version.
- **Discrepancy recorded, not silently resolved:** `.planning/research/STACK.md`
  mentions "pnpm 12 workspaces", while `.planning/PROJECT.md` locks only "pnpm
  workspaces + Corepack `packageManager`" without a version. The Phase 1 value
  is the environment-verified **pnpm@11.5.2**. Adopting a different pnpm major
  (including "pnpm 12") is an **owner change that must be escalated**, never
  adopted silently at execution time. (Threat T-01-04.)

## 2. Direct dependency inventory (API runtime + dev tooling)

Official source columns give the primary official registry page and the official
repository/documentation. Versions marked "pin registry-resolved version
exactly" had no fixed pin in research and must be resolved from the official npm
registry at scaffold time, then recorded here and in the committed lockfile
before install. Dispositions carry forward the 01-RESEARCH.md audit without
silently changing any SUS verdict.

### 2a. Runtime dependencies (`dependencies`)

| Package | Exact version | Official source (registry / repo / docs) | Researched disposition |
|---------|---------------|------------------------------------------|------------------------|
| `@nestjs/common` | 12.x — pin registry-resolved 12.5.0 exactly | https://www.npmjs.com/package/@nestjs/common ; https://github.com/nestjs/nest ; https://docs.nestjs.com | Approved [VERIFIED: npm registry; CITED: Nest official docs] |
| `@nestjs/core` | 12.x — pin registry-resolved 12.5.0 exactly | https://www.npmjs.com/package/@nestjs/core ; https://github.com/nestjs/nest ; https://docs.nestjs.com | Approved [VERIFIED: npm registry; CITED: Nest official docs] |
| `@nestjs/platform-express` | 12.x — pin registry-resolved 12.5.0 exactly | https://www.npmjs.com/package/@nestjs/platform-express ; https://github.com/nestjs/nest ; https://docs.nestjs.com | Approved [VERIFIED: npm registry; CITED: Nest official docs] |
| `@nestjs/config` | 12.1.1 | https://www.npmjs.com/package/@nestjs/config ; https://github.com/nestjs/config ; https://docs.nestjs.com/techniques/configuration | Approved [VERIFIED: npm registry; CITED: Nest official docs] |
| `@nestjs/swagger` | 12.1.2 | https://www.npmjs.com/package/@nestjs/swagger ; https://github.com/nestjs/swagger ; https://docs.nestjs.com/openapi/introduction | Approved [VERIFIED: npm registry; CITED: Nest official docs] |
| `@prisma/client` | **7.10.1** | https://www.npmjs.com/package/@prisma/client ; official repo https://github.com/prisma/prisma ; official docs https://www.prisma.io/docs | Approved; exact pins required [VERIFIED: npm registry; CITED: Prisma/Nest official docs] |
| `@prisma/adapter-pg` | **7.10.1** | https://www.npmjs.com/package/@prisma/adapter-pg ; official repo https://github.com/prisma/prisma ; official docs https://www.prisma.io/docs/orm/v7/core-concepts/supported-databases/database-drivers | Approved; exact pins required [VERIFIED: npm registry; CITED: Prisma official docs] |
| `pg` | 8.23.1 | https://www.npmjs.com/package/pg ; https://github.com/brianc/node-postgres ; https://node-postgres.com | Approved [VERIFIED: npm registry; CITED: Prisma official docs] |
| `@clerk/backend` | 3.29.0 | https://www.npmjs.com/package/@clerk/backend ; https://github.com/clerk/javascript ; https://clerk.com/docs/reference/backend/verify-token | Approved [VERIFIED: npm registry; CITED: Clerk official docs] |
| `pino` | 10.4.0 | https://www.npmjs.com/package/pino ; https://github.com/pinojs/pino ; https://getpino.io | Approved [VERIFIED: npm registry; CITED: project convention / official package docs] |
| `nestjs-pino` | 5.3.1 | https://www.npmjs.com/package/nestjs-pino ; https://github.com/iamolegga/nestjs-pino | Approved — confirm Nest 12 compatibility at install [VERIFIED: npm registry; CITED: official package docs] |
| `class-validator` | pin registry-resolved version exactly | https://www.npmjs.com/package/class-validator ; https://github.com/typestack/class-validator ; https://docs.nestjs.com/techniques/validation | Approved — official Nest-recommended boundary validation [CITED: Nest official docs] |
| `class-transformer` | pin registry-resolved version exactly | https://www.npmjs.com/package/class-transformer ; https://github.com/typestack/class-transformer | Approved — paired with class-validator [CITED: Nest official docs] |
| `reflect-metadata` | pin registry-resolved version exactly | https://www.npmjs.com/package/reflect-metadata ; https://github.com/rbuckton/reflect-metadata | Approved — Nest decorator metadata peer [VERIFIED: npm registry] |
| `rxjs` | pin registry-resolved version exactly (Nest 12 peer) | https://www.npmjs.com/package/rxjs ; https://github.com/ReactiveX/rxjs ; https://rxjs.dev | Approved — Nest 12 peer dependency [VERIFIED: npm registry] |

### 2b. Dev dependencies (`devDependencies`)

| Package | Exact version | Official source (registry / repo / docs) | Researched disposition |
|---------|---------------|------------------------------------------|------------------------|
| Vite+ (`vite-plus`) | 1.6.0 | https://www.npmjs.com/package/vite-plus ; official VoidZero project https://viteplus.dev/ | Approved; no SUS/SLOP verdict (informational `-plus` name heuristic only) [VERIFIED: npm registry; CITED: official Vite+ docs / STACK.md] |
| TypeScript | 6.0.3 | https://www.npmjs.com/package/typescript ; https://github.com/microsoft/TypeScript ; https://www.typescriptlang.org/docs/ | Approved [VERIFIED: npm registry] |
| `prisma` (CLI) | **7.10.1** | https://www.npmjs.com/package/prisma ; official repo https://github.com/prisma/prisma ; official docs https://www.prisma.io/docs/orm/v7 | Approved; **exact pin required** — npm `latest` resolves Prisma 8 RC, never use unpinned [VERIFIED: npm registry; CITED: Prisma official docs] |
| Nest CLI (`@nestjs/cli`) | pin registry-resolved version exactly | https://www.npmjs.com/package/@nestjs/cli ; https://github.com/nestjs/nest-cli ; https://docs.nestjs.com/cli/overview | Approved — official Nest build/generate tooling [VERIFIED: npm registry; CITED: Nest official docs] |
| `@nestjs/testing` | 12.x — pin registry-resolved 12.5.0 exactly | https://www.npmjs.com/package/@nestjs/testing ; https://github.com/nestjs/nest ; https://docs.nestjs.com/fundamentals/testing | Approved [VERIFIED: npm registry; CITED: Nest official docs] |
| `vitest` | 5.1.0 | https://www.npmjs.com/package/vitest ; official repo https://github.com/vitest-dev/vitest ; official docs https://vitest.dev/ | **SUS (historical slopcheck flag retained — typosquat-risk similarity to `vite`); Approved by owner after npmjs/GitHub/official-docs verification** on 2026-11-17 [VERIFIED: npm registry; CITED: official Vitest docs/repo; WARNING: slopcheck flagged as suspicious] — see §3 |
| `supertest` | 7.3.2 | https://www.npmjs.com/package/supertest ; https://github.com/ladjs/supertest ; https://docs.nestjs.com/fundamentals/testing | Approved [VERIFIED: npm registry; CITED: Nest official testing docs] |
| `@types/supertest` | pin registry-resolved version exactly | https://www.npmjs.com/package/@types/supertest ; https://github.com/DefinitelyTyped/DefinitelyTyped | Approved — official DefinitelyTyped typings [VERIFIED: npm registry] |
| `@types/node` | pin registry-resolved version exactly (align to Node 24) | https://www.npmjs.com/package/@types/node ; https://github.com/DefinitelyTyped/DefinitelyTyped | Approved — official DefinitelyTyped typings [VERIFIED: npm registry] |

## 3. Vitest 5.1.0 — legitimacy gate and owner verdict

**Historical research evidence (preserved verbatim in substance):**
- slopcheck 0.6.1 classified `vitest` as **SUS**: typosquat-risk similarity to
  `vite`. This is the reason for the blocking owner-decision gate.
- Official repository `github.com/vitest-dev/vitest` and official documentation
  `https://vitest.dev/` were identified and confirm a legitimate, official
  Vitest project; registry metadata was verified with
  `npm view vitest@5.1.0 name version repository.url dist.tarball --json`.
- Registry presence alone is **not** used as legitimacy evidence. No postinstall
  scripts were found for the audited set.
- Threat register: T-01-02 (spoofing via name similarity) and T-01-SC require
  that the SUS verdict be preserved and that the gate never be auto-approved.

**Gate history:** the blocking `checkpoint:decision` gate (T-01-02 / T-01-SC)
was resolved by an explicit owner reply; it was never auto-approved. No
`vitest` install, substitution or lockfile entry occurred before the verdict.
The historical SUS flag and its evidence above are deliberately retained.

**Owner verdict (recorded 2026-11-17):** **Approved by owner after
npmjs/GitHub/official-docs verification** — `vitest@5.1.0` is approved for
install as the Phase 1 test runner, pinned to exactly this version. The install
must stay pinned to 5.1.0 and be re-checked against the registry metadata.

Owner stance: "Vitest is not a new unknown package, but a mature and
battle-tested one. Verify the source to ensure it's not something with the same
name but with shady source."

Verification evidence gathered by the orchestrator at the owner's request:
- `npm view vitest@5.1.0 name version repository.url dist.tarball homepage --json`
  -> name=vitest, version=5.1.0,
  repository.url=git+https://github.com/vitest-dev/vitest.git,
  dist.tarball=https://registry.npmjs.org/vitest/-/vitest-5.1.0.tgz,
  homepage=https://vitest.dev.
- https://github.com/vitest-dev/vitest confirms the official Vitest project:
  17.4k stars, 2.2k forks, 6,446 commits, MIT license, "Next generation testing
  framework powered by Vite", docs at vitest.dev — a mature, battle-tested
  project, NOT a lookalike.

## 4. Explicitly excluded from the Phase 1 inventory

These must not be installed in Phase 1 and are recorded to prevent silent scope
expansion:

- `@mikro-orm/*` (core, nestjs, postgresql, migrations, decorators) —
  comparison-only candidate; the bounded ORM comparison did not select it.
- `@hey-api/openapi-ts` 0.99.0 — client generator planned for Phase 4, not Phase 1.
- `@nestjs/terminus` — not recommended; a small explicit readiness check suffices.
- The `ecom-v0` historical stack (pnpm/Biome/Lefthook/NestJS 11/TypeORM) — context
  only; explicitly not to be copied.
- Any ORM alternative validation stack (e.g. Zod alongside class-validator) —
  one boundary-validation style only.

## 5. Provenance

- All version pins above were verified against the official npm registry with
  `npm view` on 2026-11-16 and cross-checked against official project
  documentation/repositories as recorded in the "Official source" columns.
- Toolchain versions (Node 24.22.2, pnpm 11.5.2, Corepack 0.36.0) were verified
  in this environment with `node --version`, `pnpm --version` and
  `corepack --version` on 2026-11-16 and re-confirmed 2026-11-17.
- No install, manifest, lockfile or source file was created by plan 01-01.
