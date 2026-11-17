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
import { PROVIDER_REVOCATION } from '../identity/account-lifecycle.types';
import { subjectDigestFor } from '../identity/identity.repository';
import { PrivateResourceFixtureModule } from './fixtures/private-resource.fixture';

/**
 * Phase-level acceptance matrix. It composes the outcomes already proven by
 * the focused identity, capability, ownership and deletion suites into the
 * observable Phase 1 guarantees, against ONE real disposable PostgreSQL
 * database. No live Clerk credential, demo seed, sleep or skipped test is
 * used: the verifier is a deterministic signed-claim seam and the provider
 * revocation port is stubbed, while the REAL IdentityService resolver, guards,
 * validation pipe, exception filter and AccountLifecycleService run.
 */

const TOMBSTONE_SECRET = 'acceptance-tombstone-secret';

const TOKEN_SUBJECTS: Readonly<Record<string, string>> = Object.freeze({
  'owner-token': 'sub-acceptance-owner',
  'customer-token': 'sub-acceptance-customer',
  'other-token': 'sub-acceptance-other',
  'merchant-token': 'sub-acceptance-merchant',
  'brandnew-token': 'sub-acceptance-brandnew',
  'adminnew-token': 'sub-acceptance-adminnew',
});

function subjectFor(token: string): string {
  const value = TOKEN_SUBJECTS[token];
  if (value === undefined) throw new Error(`No mapped subject for token ${token}`);
  return value;
}

interface MutableClaim {
  readonly emailVerified: boolean;
  email: string;
  displayName: string;
}

let claims: Record<string, MutableClaim>;

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
  const root = mkdtempSync(resolve(tmpdir(), 'ecom-v1-acceptance-pg-'));
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
    '-c', 'CREATE DATABASE ecom_acceptance_test;',
  ]);
  return {
    url: `postgresql://postgres@127.0.0.1:${port}/ecom_acceptance_test`,
    stop(): void {
      try {
        run('pg_ctl', ['-D', dataDir, '-m', 'fast', '-w', 'stop']);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
  };
}

describe('Phase 1 acceptance matrix (real PostgreSQL)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let disposable: DisposableCluster | undefined;
  let ownerId: string;
  let customerId: string;
  let otherId: string;
  let merchantId: string;
  let ownedOrderId: string;
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

    // beforeAll runs before the shared setup file's per-test env defaults.
    process.env['DATABASE_URL'] = databaseUrl;
    process.env['DIRECT_URL'] = databaseUrl;
    process.env['CLERK_SECRET_KEY'] = 'sk_test_placeholder';
    process.env['CLERK_JWT_KEY'] = 'jwt_test_placeholder';
    process.env['CLERK_WEB_ORIGIN'] = 'http://localhost:3000';
    process.env['CLERK_ISSUER'] = 'https://clerk.example.test';
    process.env['CLERK_AUDIENCE'] = 'clerk.example.test';
    process.env['ADMIN_EMAILS'] = 'owner@example.test';
    process.env['TOMBSTONE_SECRET'] = TOMBSTONE_SECRET;

    const verifier = {
      verify: vi.fn(async (token: string): Promise<VerifiedClerkIdentity> => {
        if (token === 'invalid-token') {
          throw new UnauthorizedException('Authentication is required.');
        }
        if (token === 'missing-claim-token') {
          throw new UnauthorizedException('A required session claim is missing.');
        }
        const clerkUserId = subjectFor(token);
        const claim = claims[token];
        if (claim === undefined) {
          throw new UnauthorizedException('Authentication is required.');
        }
        return {
          clerkUserId,
          email: claim.email,
          displayName: claim.displayName,
          emailVerified: claim.emailVerified,
        };
      }),
    };

    const testModule: TestingModule = await Test.createTestingModule({
      imports: [AppModule, PrivateResourceFixtureModule],
    })
      .overrideProvider(CLERK_TOKEN_VERIFIER)
      .useValue(verifier)
      .overrideProvider(PROVIDER_REVOCATION)
      .useValue({
        revoke: vi.fn(async () => ({
          outcome: 'REVOKED' as const,
          attempts: 1,
          errorCode: null,
        })),
      })
      .compile();

    prisma = testModule.get(PrismaService);
    app = testModule.createNestApplication();
    app.useGlobalPipes(new ApiValidationPipe());
    app.useGlobalFilters(new ApiExceptionFilter({ error: (): void => undefined }));
    app.useGlobalGuards(testModule.get(ClerkAuthGuard), testModule.get(CapabilityGuard));
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    disposable?.stop();
  });

  beforeEach(async () => {
    // Claim values match the seeded local profiles so the resolver's routine
    // profile refresh is a no-op until a test deliberately changes a claim.
    claims = {
      'owner-token': { emailVerified: true, email: 'owner@example.test', displayName: 'Owner' },
      'customer-token': {
        emailVerified: true,
        email: 'customer@example.test',
        displayName: 'Customer',
      },
      'other-token': { emailVerified: true, email: 'other@example.test', displayName: 'Other' },
      'merchant-token': {
        emailVerified: true,
        email: 'merchant@example.test',
        displayName: 'Merchant',
      },
      'brandnew-token': {
        emailVerified: true,
        email: 'brandnew-token@example.test',
        displayName: 'New Customer',
      },
      'adminnew-token': {
        emailVerified: true,
        email: 'owner@example.test',
        displayName: 'New Admin',
      },
    };

    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE lifecycle_events, orders, stores, user_capabilities, ' +
        'identity_tombstones, gallery_assets, users RESTART IDENTITY',
    );

    const owner = await prisma.user.create({
      data: {
        clerkSubject: subjectFor('owner-token'),
        email: 'owner@example.test',
        displayName: 'Owner',
        capabilities: { create: [{ capability: 'CUSTOMER' }, { capability: 'ADMIN' }] },
      },
      select: { id: true },
    });
    const customer = await prisma.user.create({
      data: {
        clerkSubject: subjectFor('customer-token'),
        email: 'customer@example.test',
        displayName: 'Customer',
        capabilities: { create: [{ capability: 'CUSTOMER' }] },
      },
      select: { id: true },
    });
    const other = await prisma.user.create({
      data: {
        clerkSubject: subjectFor('other-token'),
        email: 'other@example.test',
        displayName: 'Other',
        capabilities: { create: [{ capability: 'CUSTOMER' }] },
      },
      select: { id: true },
    });
    const merchant = await prisma.user.create({
      data: {
        clerkSubject: subjectFor('merchant-token'),
        email: 'merchant@example.test',
        displayName: 'Merchant',
        capabilities: { create: [{ capability: 'CUSTOMER' }, { capability: 'MERCHANT' }] },
      },
      select: { id: true },
    });
    ownerId = owner.id;
    customerId = customer.id;
    otherId = other.id;
    merchantId = merchant.id;

    const ownerStore = await prisma.store.create({
      data: { ownerUserId: ownerId, name: 'Owner Store' },
      select: { id: true },
    });
    const merchantStore = await prisma.store.create({
      data: { ownerUserId: merchantId, name: 'Merchant Store' },
      select: { id: true },
    });
    const ownedOrder = await prisma.order.create({
      data: { buyerUserId: ownerId, storeId: ownerStore.id, status: 'PAID' },
      select: { id: true },
    });
    const retainedOrder = await prisma.order.create({
      data: { buyerUserId: customerId, storeId: ownerStore.id, status: 'DELIVERED' },
      select: { id: true },
    });
    const inFlightOrder = await prisma.order.create({
      data: { buyerUserId: otherId, storeId: merchantStore.id, status: 'PAID' },
      select: { id: true },
    });
    ownedOrderId = ownedOrder.id;
    retainedOrderId = retainedOrder.id;
    inFlightOrderId = inFlightOrder.id;
  });

  it('rejects missing, invalid and claim-incomplete authentication on protected routes', async () => {
    await request(app.getHttpServer()).get('/users/me').expect(401);
    await request(app.getHttpServer())
      .get('/users/me')
      .set('Authorization', 'Bearer invalid-token')
      .expect(401);
    await request(app.getHttpServer())
      .get('/users/me')
      .set('Authorization', 'Bearer missing-claim-token')
      .expect(401);
  });

  it('rejects malformed resource input and unknown body fields at the boundary', async () => {
    await request(app.getHttpServer())
      .get('/private/orders/not-a-uuid')
      .set('Authorization', 'Bearer owner-token')
      .expect(400);
    const rejection = await request(app.getHttpServer())
      .delete('/users/me')
      .set('Authorization', 'Bearer other-token')
      .send({ userId: ownerId, role: 'ADMIN', capability: 'ADMIN' })
      .expect(400);
    expect(rejection.body).toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('enforces the customer/admin role matrix and rejects client-supplied role fields', async () => {
    await request(app.getHttpServer())
      .post('/private/admin/action')
      .set('Authorization', 'Bearer customer-token')
      .expect(403);
    await request(app.getHttpServer())
      .post('/private/admin/action')
      .set('Authorization', 'Bearer customer-token')
      .send({ capability: 'ADMIN', role: 'ADMIN', userId: ownerId })
      .expect(403);
    const allowed = await request(app.getHttpServer())
      .post('/private/admin/action')
      .set('Authorization', 'Bearer owner-token')
      .expect(201);
    expect(allowed.body).toEqual({ ok: true, actorId: ownerId });
  });

  it('enforces cross-user ownership with a non-disclosing 404 in one database predicate', async () => {
    const own = await request(app.getHttpServer())
      .get(`/private/orders/${ownedOrderId}`)
      .set('Authorization', 'Bearer owner-token')
      .expect(200);
    expect(own.body).toMatchObject({ id: ownedOrderId, buyerUserId: ownerId, status: 'PAID' });

    const foreign = await request(app.getHttpServer())
      .get(`/private/orders/${ownedOrderId}`)
      .set('Authorization', 'Bearer other-token')
      .expect(404);
    expect(JSON.stringify(foreign.body)).not.toContain(ownedOrderId);
    expect(foreign.body).not.toHaveProperty('buyerUserId');
    expect(foreign.body).not.toHaveProperty('status');
  });

  it('provisions a first-time verified identity without granting admin', async () => {
    const response = await request(app.getHttpServer())
      .get('/users/me')
      .set('Authorization', 'Bearer brandnew-token')
      .expect(200);
    expect(response.body.email).toBe('brandnew-token@example.test');
    expect(response.body.displayName).toBe('New Customer');
    expect(response.body.capabilities).not.toContain('ADMIN');
    const created = await prisma.user.findUniqueOrThrow({
      where: { clerkSubject: subjectFor('brandnew-token') },
      include: { capabilities: true },
    });
    expect(created.capabilities.map((row) => row.capability)).toEqual(['CUSTOMER']);
  });

  it('grants admin only on first create from an allowlisted verified email', async () => {
    const first = await request(app.getHttpServer())
      .get('/users/me')
      .set('Authorization', 'Bearer adminnew-token')
      .expect(200);
    expect(first.body.capabilities).toContain('ADMIN');
    const created = await prisma.user.findUniqueOrThrow({
      where: { clerkSubject: subjectFor('adminnew-token') },
      include: { capabilities: true },
    });
    expect(created.capabilities.map((row) => row.capability)).toContain('ADMIN');
  });

  it('refreshes email and profile on return without mutating roles', async () => {
    const before = await request(app.getHttpServer())
      .get('/users/me')
      .set('Authorization', 'Bearer customer-token')
      .expect(200);
    expect(before.body.email).toBe('customer@example.test');
    expect(before.body.capabilities).not.toContain('ADMIN');

    // A returning account whose email now matches the allowlist must not gain
    // admin: the policy runs only in the first-create branch (D-04).
    claims['customer-token'] = {
      emailVerified: true,
      email: 'owner@example.test',
      displayName: 'Renamed Customer',
    };
    const after = await request(app.getHttpServer())
      .get('/users/me')
      .set('Authorization', 'Bearer customer-token')
      .expect(200);
    expect(after.body).toMatchObject({
      id: before.body.id,
      email: 'owner@example.test',
      displayName: 'Renamed Customer',
    });
    expect(after.body.capabilities).not.toContain('ADMIN');
  });

  it('anonymizes personal fields in place while retaining the stable order reference', async () => {
    await request(app.getHttpServer())
      .delete('/users/me')
      .set('Authorization', 'Bearer customer-token')
      .expect(204);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: customerId } });
    expect(user.lifecycleStatus).toBe('ANONYMIZED');
    expect(user.email).toBeNull();
    expect(user.displayName).toBeNull();
    expect(user.clerkSubject).toBeNull();

    const order = await prisma.order.findUniqueOrThrow({ where: { id: retainedOrderId } });
    expect(order.buyerUserId).toBe(customerId);
    expect(order.status).toBe('DELIVERED');

    const digest = subjectDigestFor(subjectFor('customer-token'), TOMBSTONE_SECRET);
    const tombstone = await prisma.identityTombstone.findUniqueOrThrow({
      where: { subjectDigest: digest },
    });
    expect(tombstone.expiresAt).toBeNull();
    expect(JSON.stringify(tombstone)).not.toContain(subjectFor('customer-token'));
  });

  it('stages merchant closure for obligations and finalizes once they resolve', async () => {
    const accepted = await request(app.getHttpServer())
      .delete('/users/me')
      .set('Authorization', 'Bearer merchant-token')
      .expect(202);
    expect(accepted.body).toMatchObject({
      code: 'CLOSURE_ACCEPTED',
      lifecycleStatus: 'CLOSURE_ACCEPTED',
    });

    const pending = await prisma.user.findUniqueOrThrow({ where: { id: merchantId } });
    expect(pending.lifecycleStatus).toBe('CLOSURE_ACCEPTED');
    expect(pending.email).not.toBeNull();
    expect(await prisma.identityTombstone.count()).toBe(0);
    const stores = await prisma.store.findMany({ where: { ownerUserId: merchantId } });
    expect(stores.every((store) => store.status === 'CLOSED')).toBe(true);

    await prisma.order.update({
      where: { id: inFlightOrderId },
      data: { status: 'DELIVERED' },
    });
    await request(app.getHttpServer())
      .delete('/users/me')
      .set('Authorization', 'Bearer merchant-token')
      .expect(204);
    const finalized = await prisma.user.findUniqueOrThrow({ where: { id: merchantId } });
    expect(finalized.lifecycleStatus).toBe('ANONYMIZED');
    expect(
      await prisma.identityTombstone.findUnique({
        where: {
          subjectDigest: subjectDigestFor(subjectFor('merchant-token'), TOMBSTONE_SECRET),
        },
      }),
    ).not.toBeNull();
  });

  it('denies a copied still-valid token after deletion and never re-provisions', async () => {
    const before = await prisma.user.count();
    await request(app.getHttpServer())
      .delete('/users/me')
      .set('Authorization', 'Bearer customer-token')
      .expect(204);
    await request(app.getHttpServer())
      .get('/users/me')
      .set('Authorization', 'Bearer customer-token')
      .expect(401);
    expect(await prisma.user.count()).toBe(before);
    expect(
      await prisma.user.findFirst({ where: { clerkSubject: subjectFor('customer-token') } }),
    ).toBeNull();
  });
});

describe('Phase 1 journey contract documentation', () => {
  it('declares the actor journeys and the exact gallery seed schema capacity scope', () => {
    const doc = readFileSync(
      resolve(__dirname, '../../../../docs/architecture/phase-01-journeys.md'),
      'utf8',
    );
    for (const heading of [
      '## Customer journey',
      '## Merchant journey',
      '## Admin journey',
      '## Gallery seed schema capacity',
    ]) {
      expect(doc).toContain(heading);
    }
    for (const owner of ['Phase 2', 'Phase 3', 'Phase 4', 'Phase 5']) {
      expect(doc).toContain(owner);
    }
    expect(doc).toContain('gallery_assets');
  });
});
