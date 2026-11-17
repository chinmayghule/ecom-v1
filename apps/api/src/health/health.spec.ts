import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../common/database/prisma.service';
import { ApiExceptionFilter, type ExceptionSink } from '../common/errors/api-exception.filter';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

/**
 * Liveness/readiness contract (threats T-05-04 and T-05-06).
 *
 * Readiness probes are tested against a real disposable PostgreSQL database
 * (proving a real query runs) and against a controlled Prisma failure seam for
 * unavailable/timed-out cases. No arbitrary sleep represents a timeout.
 */

const VALID_ENV: NodeJS.ProcessEnv = {
  DATABASE_URL: 'postgresql://runtime@db.internal:5432/runtime_db',
  DIRECT_URL: 'postgresql://migration@db.internal:5432/migration_db',
  CLERK_SECRET_KEY: 'sk_test_runtime_only',
  CLERK_JWT_KEY: 'jwt_test_key',
  CLERK_WEB_ORIGIN: 'http://localhost:3000',
  CLERK_ISSUER: 'https://clerk.example.test',
  CLERK_AUDIENCE: 'clerk.example.test',
  ADMIN_EMAILS: 'owner@example.test',
  TOMBSTONE_SECRET: 'tombstone-hmac-test-secret',
};

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
let originalEnv: NodeJS.ProcessEnv;

beforeAll(async () => {
  originalEnv = { ...process.env };
  const external = process.env['TEST_DATABASE_URL'];
  if (external) {
    databaseUrl = external;
    return;
  }
  const port = await pickFreePort();
  const root = mkdtempSync(resolve(tmpdir(), 'ecom-v1-health-pg-'));
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
    '--no-psqlrc',
    '-q',
    '-h',
    '127.0.0.1',
    '-p',
    String(port),
    '-U',
    'postgres',
    '-d',
    'postgres',
    '-c',
    'CREATE DATABASE ecom_health_test;',
  ]);
  databaseUrl = `postgresql://postgres@127.0.0.1:${port}/ecom_health_test`;
  cleanupDb = () => {
    try {
      run('pg_ctl', ['-D', dataDir, '-m', 'fast', '-w', 'stop']);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  };
});

afterAll(() => {
  cleanupDb?.();
  process.env = { ...originalEnv };
});

function fakePrisma(probe: () => Promise<unknown>): PrismaService {
  return { $queryRaw: probe } as unknown as PrismaService;
}

const silentSink: ExceptionSink = {
  error(): void {
    /* server-side detail is not asserted for health routes */
  },
};

let app: INestApplication | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function buildApp(healthService: HealthService): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    controllers: [HealthController],
    providers: [{ provide: HealthService, useValue: healthService }],
  }).compile();
  app = moduleRef.createNestApplication();
  app.useGlobalFilters(new ApiExceptionFilter(silentSink));
  await app.init();
  return app;
}

describe('liveness (no database dependency)', () => {
  it('reports the running process without issuing a database query', async () => {
    let called = false;
    const service = new HealthService(
      fakePrisma(async () => {
        called = true;
        return [];
      }),
    );

    expect(service.getLiveness()).toEqual({ status: 'ok' });
    expect(called).toBe(false);
  });

  it('serves GET /health/live as a public 200 even when the database is broken', async () => {
    const service = new HealthService(
      fakePrisma(async () => {
        throw new Error('database is down');
      }),
    );
    await buildApp(service);

    const response = await request(app!.getHttpServer()).get('/health/live').expect(200);
    expect(response.body).toEqual({ status: 'ok' });
  });
});

describe('readiness (real PostgreSQL dependency)', () => {
  it('succeeds only when a real PostgreSQL query succeeds', async () => {
    process.env = {
      ...VALID_ENV,
      DATABASE_URL: databaseUrl,
      DIRECT_URL: `${databaseUrl}-direct`,
    };
    const prisma = new PrismaService();
    await prisma.onModuleInit();
    try {
      const service = new HealthService(prisma);
      await expect(service.getReadiness()).resolves.toEqual({
        status: 'ok',
        checks: { database: { status: 'up' } },
      });
    } finally {
      await prisma.onModuleDestroy();
    }
  });

  it('serves GET /health/ready as 200 with dependency status when the database is up', async () => {
    const service = new HealthService(fakePrisma(async () => [{ ok: true }]));
    await buildApp(service);

    const response = await request(app!.getHttpServer()).get('/health/ready').expect(200);
    expect(response.body).toEqual({
      status: 'ok',
      checks: { database: { status: 'up' } },
    });
  });
});

describe('readiness failure is non-2xx and non-disclosing', () => {
  const SENSITIVE = ['postgres://', 'connection refused', 'SELECT', 'stack', 'db.internal'];

  it('returns 503 without connection detail when the database probe rejects', async () => {
    const service = new HealthService(
      fakePrisma(async () => {
        throw new Error('connection refused at postgres://secret:pass@db.internal/ecom');
      }),
    );
    await buildApp(service);

    const response = await request(app!.getHttpServer()).get('/health/ready').expect(503);
    const serialized = JSON.stringify(response.body);
    for (const marker of SENSITIVE) {
      expect(serialized).not.toContain(marker);
    }
  });

  it('returns 503 when the bounded probe times out', async () => {
    const neverResolves = (): Promise<unknown> => new Promise(() => undefined);
    const service = new HealthService(fakePrisma(neverResolves), 25);
    await buildApp(service);

    await request(app!.getHttpServer()).get('/health/ready').expect(503);
  });

  it('returns 503 when the probe returns an unexpected result shape', async () => {
    const service = new HealthService(fakePrisma(async () => [{ ok: 'maybe' }]));
    await buildApp(service);

    await request(app!.getHttpServer()).get('/health/ready').expect(503);
  });
});
