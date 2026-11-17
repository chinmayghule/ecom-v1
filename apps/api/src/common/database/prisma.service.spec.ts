import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  ConfigurationError,
  DATABASE_ACQUIRE_TIMEOUT_MS,
  DATABASE_IDLE_TIMEOUT_MS,
  DATABASE_POOL_MAX,
  validateEnv,
  type AppConfig,
} from '../config/env.validation';
import { PrismaService } from './prisma.service';

const VALID_ENV: NodeJS.ProcessEnv = {
  DATABASE_URL: 'postgresql://runtime-user@db.internal:5432/runtime_db',
  DIRECT_URL: 'postgresql://migration-user@db.internal:5432/migration_db',
  CLERK_SECRET_KEY: 'sk_test_runtime_only',
  CLERK_JWT_KEY: 'jwt_test_key',
  CLERK_WEB_ORIGIN: 'http://localhost:3000',
  ADMIN_EMAILS: 'Owner@Example.test, second@example.test ',
  TOMBSTONE_SECRET: 'tombstone-hmac-test-secret',
};

function valueFree(message: string): boolean {
  return !message.includes('runtime-user') && !message.includes('sk_test_runtime_only') &&
    !message.includes('tombstone-hmac-test-secret') && !message.includes('db.internal');
}

function run(command: string, args: readonly string[]): void {
  const result = spawnSync(command, [...args], { encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} failed (${result.status}): ${result.stderr ?? ''}${result.stdout ?? ''}`);
  }
}

function pickFreePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address !== null ? address.port : 0;
      server.close(() => resolvePort(port));
    });
  });
}

let databaseUrl: string;
let cleanupDb: (() => void) | undefined;

beforeAll(async () => {
  const external = process.env['TEST_DATABASE_URL'];
  if (external) {
    databaseUrl = external;
    return;
  }
  const port = await pickFreePort();
  const root = mkdtempSync(resolve(tmpdir(), 'ecom-v1-prisma-pg-'));
  const dataDir = resolve(root, 'data');
  mkdirSync(dataDir, { recursive: true });
  run('initdb', ['-D', dataDir, '--no-locale', '--encoding=UTF8', '--auth=trust', '-U', 'postgres']);
  run('pg_ctl', [
    '-D',
    dataDir,
    '-o',
    `-p ${port} -k ${root} -c listen_addresses=127.0.0.1`,
    '-l',
    resolve(root, 'postgres.log'),
    '-w',
    'start',
  ]);
  run('psql', [
    '--no-psqlrc', '-q', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'postgres',
    '-c', 'CREATE DATABASE ecom_prisma_test;',
  ]);
  databaseUrl = `postgresql://postgres@127.0.0.1:${port}/ecom_prisma_test`;
  run('psql', [
    '--no-psqlrc', '-q', '-v', 'ON_ERROR_STOP=1',
    '-f', resolve(__dirname, '../../../prisma/migrations/0001_identity_foundation/migration.sql'),
    databaseUrl,
  ]);
  cleanupDb = () => {
    try {
      run('pg_ctl', ['-D', dataDir, '-m', 'fast', '-w', 'stop']);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  };
});

afterAll(() => cleanupDb?.());

describe('typed environment validation', () => {
  it('fails with a sanitized error when DATABASE_URL is missing', () => {
    const env = { ...VALID_ENV };
    delete env['DATABASE_URL'];
    expect(() => validateEnv(env)).toThrow(ConfigurationError);
    try {
      validateEnv(env);
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigurationError);
      const message = (error as Error).message;
      expect(message).toContain('DATABASE_URL');
      expect(message).not.toContain('DIRECT_URL');
      expect(valueFree(message)).toBe(true);
    }
  });

  it('fails with a sanitized error when DIRECT_URL is missing', () => {
    const env = { ...VALID_ENV };
    delete env['DIRECT_URL'];
    try {
      validateEnv(env);
      throw new Error('expected ConfigurationError');
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigurationError);
      const message = (error as Error).message;
      expect(message).toContain('DIRECT_URL');
      expect(message).not.toContain('DATABASE_URL');
      expect(valueFree(message)).toBe(true);
    }
  });

  it('fails safely when a required secret is blank, weak or a URL is malformed', () => {
    expect(() => validateEnv({ ...VALID_ENV, TOMBSTONE_SECRET: '' })).toThrow(ConfigurationError);
    expect(() => validateEnv({ ...VALID_ENV, TOMBSTONE_SECRET: 'short' })).toThrow(
      ConfigurationError,
    );
    expect(() => validateEnv({ ...VALID_ENV, TOMBSTONE_SECRET: 'changeme' })).toThrow(
      ConfigurationError,
    );
    expect(() => validateEnv({ ...VALID_ENV, DATABASE_URL: 'not-a-url' })).toThrow(ConfigurationError);
  });

  it('returns a typed config with distinct direct/runtime URLs and normalized admin emails', () => {
    const config = validateEnv(VALID_ENV);
    expect(config.databaseUrl).toBe(VALID_ENV['DATABASE_URL']);
    expect(config.directUrl).toBe(VALID_ENV['DIRECT_URL']);
    expect(config.databaseUrl).not.toBe(config.directUrl);
    expect(config.adminEmails).toEqual(['owner@example.test', 'second@example.test']);
    expect(config.databasePoolMax).toBe(DATABASE_POOL_MAX);
    expect(config.databaseAcquireTimeoutMs).toBe(DATABASE_ACQUIRE_TIMEOUT_MS);
    expect(config.databaseIdleTimeoutMs).toBe(DATABASE_IDLE_TIMEOUT_MS);
  });
});

describe('PrismaService runtime lifecycle (real PostgreSQL)', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeAll(() => {
    originalEnv = { ...process.env };
  });

  afterAll(() => {
    process.env = { ...originalEnv };
  });

  function useRuntimeEnv(): AppConfig {
    const env = {
      ...VALID_ENV,
      DATABASE_URL: databaseUrl,
      DIRECT_URL: `${databaseUrl}-direct`,
    } satisfies NodeJS.ProcessEnv;
    process.env = env;
    return validateEnv(env);
  }

  it('connects on init, executes a real query, and releases the bounded pool on shutdown', async () => {
    const config = useRuntimeEnv();
    const service = new PrismaService();
    const pool = (service as unknown as { pool: { options: Record<string, unknown>; ending: boolean } }).pool;

    expect(pool.options.max).toBe(config.databasePoolMax);
    expect(pool.options.connectionTimeoutMillis).toBe(DATABASE_ACQUIRE_TIMEOUT_MS);
    expect(pool.options.idleTimeoutMillis).toBe(DATABASE_IDLE_TIMEOUT_MS);
    expect(pool.options.connectionString).toBe(databaseUrl);

    await service.onModuleInit();
    try {
      const rows = await service.$queryRaw<Array<{ ok: boolean }>>`SELECT true AS ok`;
      expect(rows).toEqual([{ ok: true }]);
    } finally {
      await service.onModuleDestroy();
    }

    expect(pool.ending).toBe(true);
    await expect(service.$queryRaw`SELECT 1`).rejects.toThrow();
  });
});
