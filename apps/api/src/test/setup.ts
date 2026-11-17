import { afterEach, beforeEach } from 'vitest';

/**
 * Deterministic, non-secret environment defaults for every API suite.
 *
 * Nothing here reads a live database, Clerk credential or demo seed. Original
 * values are captured once and restored between tests so environment state
 * cannot leak across suites or into a shared worker.
 */
const TEST_ENV_DEFAULTS: Readonly<Record<string, string>> = Object.freeze({
  NODE_ENV: 'test',
  TZ: 'UTC',
});

const originalEnv: Record<string, string | undefined> = {};

for (const key of Object.keys(TEST_ENV_DEFAULTS)) {
  originalEnv[key] = process.env[key];
}

beforeEach(() => {
  for (const [key, value] of Object.entries(TEST_ENV_DEFAULTS)) {
    process.env[key] = value;
  }
});

afterEach(() => {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});
