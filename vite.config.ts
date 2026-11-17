/**
 * Root Vite+ / Vitest configuration.
 *
 * Phase 1 has exactly one test project: the NestJS API. The project's own
 * `apps/api/vitest.config.ts` owns the setup file and include patterns; this
 * root file only points the workspace-level `vp test` runner at that project so
 * `pnpm test` and `pnpm --filter @ecom-v1/api test` share one layout.
 */
export default {
  test: {
    projects: ['apps/api/vitest.config.ts'],
  },
};
