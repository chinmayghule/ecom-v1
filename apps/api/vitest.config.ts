import { defineConfig } from 'vitest/config';

/**
 * The single API test project for Phase 1.
 *
 * Layout (all other plans must follow it):
 *  - co-located unit tests:  apps/api/src/<domain>/<name>.spec.ts
 *  - HTTP / API suites:      apps/api/src/<domain>/<name>.e2e-spec.ts
 *  - shared fixtures:        apps/api/src/test/fixtures/
 *  - shared setup:           apps/api/src/test/setup.ts
 *
 * There is deliberately no separate top-level apps/api/test/ tree.
 */
export default defineConfig({
  test: {
    name: 'api',
    globals: false,
    environment: 'node',
    include: ['src/**/*.spec.ts', 'src/**/*.e2e-spec.ts'],
    setupFiles: ['./src/test/setup.ts'],
    // Each file runs in an isolated worker. Later real-PostgreSQL suites give
    // each worker its own disposable database, so no mutable fixture is shared.
    isolate: true,
  },
});
