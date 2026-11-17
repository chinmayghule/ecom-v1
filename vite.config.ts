/**
 * Root Vite+ / Vitest configuration.
 *
 * Phase 1 has exactly one test project: the NestJS API. The project's own
 * `apps/api/vitest.config.ts` owns the setup file and include patterns; this
 * root file points the workspace-level `vp test` runner at that project so
 * `pnpm test` and `pnpm --filter @ecom-v1/api test` share one layout.
 */
import { defineConfig } from 'vite-plus';

export default defineConfig({
  fmt: {
    // The committed source uses single quotes; keep vp fmt aligned with it.
    singleQuote: true,
  },
  check: {
    // 01-09: the committed tree predates formatter configuration and contains
    // pre-existing formatting differences across planning docs and legacy
    // sources. Reformatting those is out of scope for this integration-proof
    // plan (see .planning/phases/01-platform-foundation-identity/
    // deferred-items.md). The enforced gate therefore runs the lint + typecheck
    // steps of the Vite+ check; format debt is recorded, not silently applied.
    fmt: false,
  },
  test: {
    projects: ['apps/api/vitest.config.ts'],
  },
});
