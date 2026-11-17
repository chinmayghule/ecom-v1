import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { UnauthorizedException, type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../app.module';
import {
  CLERK_TOKEN_VERIFIER,
  type VerifiedClerkIdentity,
} from '../common/auth/auth.types';
import { ClerkAuthGuard } from '../common/auth/clerk-auth.guard';
import { CapabilityGuard } from '../common/authorization/capability.guard';
import { PrismaService } from '../common/database/prisma.service';
import { ApiExceptionFilter } from '../common/errors/api-exception.filter';
import { ApiValidationPipe } from '../common/validation/validation.pipe';
import { AccountLifecycleRepository } from './account-lifecycle.repository';
import { PROVIDER_REVOCATION } from './account-lifecycle.types';
import { subjectDigestFor } from './identity.repository';

/**
 * Real-PostgreSQL evidence for retention, staged closure, permanent tombstone
 * denial, provider-failure safety and self-only deletion. No Docker daemon is
 * required: a disposable initdb/pg_ctl cluster is used when TEST_DATABASE_URL
 * is not supplied (same fallback as the earlier identity suites).
 */

const TOMBSTONE_SECRET = 'test-tombstone-hmac-secret';

const TOKENS: Readonly<Record<string, string>> = Object.freeze({
  'alice-token': 'sub-alice',
  'bob-token': 'sub-bob',
  'merchant-token': 'sub-merchant',
});

interface DisposableCluster {
  readonly url: string;
  stop(): void;
}

function run(command: string, args: readonly string[]): string {
  const result = spawnSync(command, [...args], { encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} failed (${result.status}):\n${result.stderr ?? ''}${result.stdout ?? ''}`,
    );
  }
  return result.stdout ?? '';
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

function provisionLocalCluster(port: number): DisposableCluster {
  const root = mkdtempSync(resolve(tmpdir(), 'ecom-v1-lifecycle-pg-'));
  const dataDir = resolve(root, 'data');
  mkdirSync(dataDir, { recursive: true });
  run('initdb', [
    '-D', dataDir,
    '--no-locale', '--encoding=UTF8', '--auth=trust', '-U', 'postgres',
  ]);
  run('pg_ctl', [
    '-D', dataDir,
    '-o', `-p ${port} -k ${root} -c listen_addresses=127.0.0.1`,
    '-l', resolve(root, 'postgres.log'),
    '-w', 'start',
  ]);
  run('psql', [
    '--no-psqlrc', '-q', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'postgres',
    '-c', 'CREATE DATABASE ecom_lifecycle_test;',
  ]);
  return {
    url: `postgresql://postgres@127.0.0.1:${port}/ecom_lifecycle_test`,
    stop(): void {
      try {
        run('pg_ctl', ['-D', dataDir, '-m', 'fast', '-w', 'stop']);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
  };
}

describe('account deletion lifecycle (real PostgreSQL)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let disposable: DisposableCluster | undefined;
  let recordProviderOutcome: (
    digest: string,
    outcome: 'REVOKED' | 'FAILED',
    attempts: number,
    errorCode: string | null,
  ) => Promise<void>;

  // Set per test so the provider stub controls the recorded failure path.
  let providerBehavior: 'SUCCEED' | 'FAIL' = 'SUCCEED';

  let aliceId: string;
  let bobId: string;
  let merchantId: string;
  let retainedOrderId: string;
  let inFlightOrderId: string;

  beforeAll(async () => {
    const external = process.env['TEST_DATABASE_URL'];
    let databaseUrl: string;
    if (external) {
      databaseUrl = external;
    } else {
      disposable = provisionLocalCluster(await pickFreePort());
      databaseUrl = disposable.url;
      const migrationPath = resolve(
        __dirname,
        '../../prisma/migrations/0001_identity_foundation/migration.sql',
      );
      if (!existsSync(migrationPath)) {
        throw new Error(`Committed migration is missing: ${migrationPath}`);
      }
      run('psql', ['--no-psqlrc', '-q', '-v', 'ON_ERROR_STOP=1', '-f', migrationPath, databaseUrl]);
    }

    // beforeAll precedes the shared setup file's per-test env defaults.
    process.env['DATABASE_URL'] = databaseUrl;
    process.env['DIRECT_URL'] = databaseUrl;
    process.env['CLERK_SECRET_KEY'] = 'sk_test_placeholder';
    process.env['CLERK_JWT_KEY'] = 'jwt_test_placeholder';
    process.env['CLERK_WEB_ORIGIN'] = 'http://localhost:3000';
    process.env['ADMIN_EMAILS'] = 'owner@example.test';
    process.env['TOMBSTONE_SECRET'] = TOMBSTONE_SECRET;

    const verifier = {
      verify: vi.fn(async (token: string): Promise<VerifiedClerkIdentity> => {
        const clerkUserId = TOKENS[token];
        if (clerkUserId === undefined) {
          throw new UnauthorizedException('Authentication is required.');
        }
        return {
          clerkUserId,
          email: `${clerkUserId}@example.test`,
          displayName: clerkUserId,
          emailVerified: true,
        };
      }),
    };

    // The real IdentityService resolver is intentionally left in place so the
    // committed tombstone is consulted on the copied-token replay test.
    const testModule: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CLERK_TOKEN_VERIFIER)
      .useValue(verifier)
      .overrideProvider(PROVIDER_REVOCATION)
      .useValue({
        revoke: vi.fn(async (_subject: string, digest: string) => {
          if (providerBehavior === 'FAIL') {
            await recordProviderOutcome(digest, 'FAILED', 3, 'PROVIDER_AUTH_CONFIG');
            return { outcome: 'FAILED', attempts: 3, errorCode: 'PROVIDER_AUTH_CONFIG' };
          }
          await recordProviderOutcome(digest, 'REVOKED', 1, null);
          return { outcome: 'REVOKED', attempts: 1, errorCode: null };
        }),
      })
      .compile();

    const lifecycleRepo = testModule.get(AccountLifecycleRepository);
    recordProviderOutcome = lifecycleRepo.recordProviderOutcome.bind(lifecycleRepo);

    app = testModule.createNestApplication();
    app.useGlobalPipes(new ApiValidationPipe());
    app.useGlobalFilters(new ApiExceptionFilter({ error: (): void => undefined }));
    app.useGlobalGuards(testModule.get(ClerkAuthGuard), testModule.get(CapabilityGuard));
    await app.init();

    prisma = testModule.get(PrismaService);
  });

  afterAll(async () => {
    await app?.close();
    disposable?.stop();
  });

  beforeEach(async () => {
    providerBehavior = 'SUCCEED';
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE lifecycle_events, orders, stores, user_capabilities, ' +
        'identity_tombstones, gallery_assets, users RESTART IDENTITY',
    );

    const alice = await prisma.user.create({
      data: {
        clerkSubject: 'sub-alice',
        email: 'alice@example.test',
        displayName: 'Alice',
        capabilities: { create: [{ capability: 'CUSTOMER' }, { capability: 'ADMIN' }] },
      },
      select: { id: true },
    });
    const bob = await prisma.user.create({
      data: {
        clerkSubject: 'sub-bob',
        email: 'bob@example.test',
        displayName: 'Bob',
        capabilities: { create: [{ capability: 'CUSTOMER' }] },
      },
      select: { id: true },
    });
    const merchant = await prisma.user.create({
      data: {
        clerkSubject: 'sub-merchant',
        email: 'merchant@example.test',
        displayName: 'Merchant',
        capabilities: { create: [{ capability: 'CUSTOMER' }, { capability: 'MERCHANT' }] },
      },
      select: { id: true },
    });
    aliceId = alice.id;
    bobId = bob.id;
    merchantId = merchant.id;

    const carolStore = await prisma.store.create({
      data: { ownerUserId: merchantId, name: 'Carol Store' },
      select: { id: true },
    });
    const retained = await prisma.order.create({
      data: { buyerUserId: aliceId, storeId: carolStore.id, status: 'DELIVERED' },
      select: { id: true },
    });
    retainedOrderId = retained.id;

    const merchantStore = await prisma.store.create({
      data: { ownerUserId: merchantId, name: 'Merchant Store' },
      select: { id: true },
    });
    const inFlight = await prisma.order.create({
      data: { buyerUserId: bobId, storeId: merchantStore.id, status: 'PAID' },
      select: { id: true },
    });
    inFlightOrderId = inFlight.id;
  });

  it('anonymizes an eligible user in place, retaining the order reference and stable id', async () => {
    const response = await request(app.getHttpServer())
      .delete('/users/me')
      .set('Authorization', 'Bearer alice-token')
      .expect(204);
    expect(response.text).toBe('');

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: aliceId },
      include: { capabilities: true },
    });
    expect(user.lifecycleStatus).toBe('ANONYMIZED');
    expect(user.email).toBeNull();
    expect(user.displayName).toBeNull();
    expect(user.clerkSubject).toBeNull();
    expect(user.capabilities.map((capability) => capability.capability)).not.toContain('ADMIN');

    const order = await prisma.order.findUniqueOrThrow({ where: { id: retainedOrderId } });
    expect(order.buyerUserId).toBe(aliceId);
    expect(order.status).toBe('DELIVERED');

    const digest = subjectDigestFor('sub-alice', TOMBSTONE_SECRET);
    const tombstone = await prisma.identityTombstone.findUniqueOrThrow({
      where: { subjectDigest: digest },
    });
    expect(tombstone.expiresAt).toBeNull();
    expect(tombstone.providerRevocationOutcome).toBe('REVOKED');
    expect(JSON.stringify(tombstone)).not.toContain('sub-alice');
  });

  it('reaches only the owner-approved staged states and finalizes after obligations resolve', async () => {
    const pending = await request(app.getHttpServer())
      .delete('/users/me')
      .set('Authorization', 'Bearer merchant-token')
      .expect(202);
    expect(pending.body).toEqual({
      code: 'CLOSURE_ACCEPTED',
      lifecycleStatus: 'CLOSURE_ACCEPTED',
    });

    const accepted = await prisma.user.findUniqueOrThrow({ where: { id: merchantId } });
    // No early anonymization: personal data is cleared only when obligations resolve.
    expect(accepted.lifecycleStatus).toBe('CLOSURE_ACCEPTED');
    expect(accepted.email).toBe('merchant@example.test');
    expect(await prisma.identityTombstone.count()).toBe(0);

    const stores = await prisma.store.findMany({ where: { ownerUserId: merchantId } });
    expect(stores.every((store) => store.status === 'CLOSED')).toBe(true);

    // No invented early-final state exists; only the four schema states are used.
    const statuses = await prisma.user.findMany({
      distinct: ['lifecycleStatus'],
      select: { lifecycleStatus: true },
    });
    for (const row of statuses) {
      expect(['ACTIVE', 'CLOSURE_REQUESTED', 'CLOSURE_ACCEPTED', 'ANONYMIZED']).toContain(
        row.lifecycleStatus,
      );
    }

    await prisma.order.update({
      where: { id: inFlightOrderId },
      data: { status: 'DELIVERED' },
    });

    const completed = await request(app.getHttpServer())
      .delete('/users/me')
      .set('Authorization', 'Bearer merchant-token')
      .expect(204);
    expect(completed.text).toBe('');

    const finalized = await prisma.user.findUniqueOrThrow({ where: { id: merchantId } });
    expect(finalized.lifecycleStatus).toBe('ANONYMIZED');
    expect(finalized.email).toBeNull();
    expect(
      await prisma.identityTombstone.findUniqueOrThrow({
        where: { subjectDigest: subjectDigestFor('sub-merchant', TOMBSTONE_SECRET) },
      }),
    ).toBeDefined();
  });

  it('denies a copied, still-valid token after deletion and never re-provisions', async () => {
    const before = await prisma.user.count();
    await request(app.getHttpServer())
      .delete('/users/me')
      .set('Authorization', 'Bearer alice-token')
      .expect(204);

    await request(app.getHttpServer())
      .get('/users/me')
      .set('Authorization', 'Bearer alice-token')
      .expect(401);

    expect(await prisma.user.count()).toBe(before);
    expect(await prisma.user.findFirst({ where: { clerkSubject: 'sub-alice' } })).toBeNull();
  });

  it('never lets another authenticated user delete or reach the target account', async () => {
    const rejection = await request(app.getHttpServer())
      .delete('/users/me')
      .set('Authorization', 'Bearer bob-token')
      .send({ userId: aliceId, role: 'ADMIN', capability: 'ADMIN' })
      .expect(400);
    expect(rejection.body).toMatchObject({ statusCode: 400, code: 'VALIDATION_FAILED' });

    await request(app.getHttpServer())
      .delete('/users/me')
      .set('Authorization', 'Bearer bob-token')
      .expect(204);

    const alice = await prisma.user.findUniqueOrThrow({ where: { id: aliceId } });
    expect(alice.lifecycleStatus).toBe('ACTIVE');
    expect(alice.email).toBe('alice@example.test');
    const bob = await prisma.user.findUniqueOrThrow({ where: { id: bobId } });
    expect(bob.lifecycleStatus).toBe('ANONYMIZED');
  });

  it('keeps local denial and retained records intact when provider revocation fails', async () => {
    providerBehavior = 'FAIL';

    const response = await request(app.getHttpServer())
      .delete('/users/me')
      .set('Authorization', 'Bearer alice-token')
      .expect(409);
    expect(response.body).toEqual({
      code: 'PROVIDER_REVOCATION_FAILED',
      lifecycleStatus: 'ANONYMIZED',
    });

    const user = await prisma.user.findUniqueOrThrow({ where: { id: aliceId } });
    expect(user.lifecycleStatus).toBe('ANONYMIZED');
    expect(user.email).toBeNull();

    const order = await prisma.order.findUniqueOrThrow({ where: { id: retainedOrderId } });
    expect(order.buyerUserId).toBe(aliceId);

    const tombstone = await prisma.identityTombstone.findUniqueOrThrow({
      where: { subjectDigest: subjectDigestFor('sub-alice', TOMBSTONE_SECRET) },
    });
    expect(tombstone.providerRevocationOutcome).toBe('FAILED');
    expect(tombstone.providerRevocationAttempts).toBe(3);
    expect(tombstone.providerRevocationLastErrorCode).toBe('PROVIDER_AUTH_CONFIG');
    expect(tombstone.providerRevokedAt).toBeNull();

    await request(app.getHttpServer())
      .get('/users/me')
      .set('Authorization', 'Bearer alice-token')
      .expect(401);
  });
});

describe('account deletion documentation', () => {
  it('documents the exact lifecycle, anonymization, tombstone and provider contract', () => {
    const doc = readFileSync(
      resolve(__dirname, '../../../../docs/identity/account-deletion.md'),
      'utf8',
    );
    for (const heading of [
      '## Lifecycle states',
      '## Anonymized fields',
      '## Retained fields',
      '## Tombstone',
      '## Provider revocation',
      '## Restricted merchant actions',
      '## Retry and conflict responses',
      '## Legal retention not implemented',
    ]) {
      expect(doc).toContain(heading);
    }
    for (const term of [
      'email',
      'display_name',
      'subject_digest',
      'HMAC',
      'CLOSURE_ACCEPTED',
      'ANONYMIZED',
    ]) {
      expect(doc).toContain(term);
    }
  });
});
