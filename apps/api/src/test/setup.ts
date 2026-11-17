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
  // Non-secret placeholders so a Nest app importing PrismaModule can compile in
  // the baseline harness without a live database or real Clerk credentials.
  DATABASE_URL: 'postgresql://test@127.0.0.1:5432/ecom_test',
  DIRECT_URL: 'postgresql://test@127.0.0.1:5432/ecom_test',
  CLERK_SECRET_KEY: 'sk_test_placeholder',
  CLERK_JWT_KEY: 'jwt_test_placeholder',
  CLERK_WEB_ORIGIN: 'http://localhost:3000',
  CLERK_ISSUER: 'https://clerk.example.test',
  CLERK_AUDIENCE: 'clerk.example.test',
  ADMIN_EMAILS: 'owner@example.test',
  TOMBSTONE_SECRET: 'tombstone-test-placeholder',
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
