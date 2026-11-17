import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { UnauthorizedException, type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../app.module';
import {
  CLERK_TOKEN_VERIFIER,
  IDENTITY_RESOLVER,
  type ApplicationCapability,
  type AuthenticatedUser,
  type VerifiedClerkIdentity,
} from '../common/auth/auth.types';
import { ClerkAuthGuard } from '../common/auth/clerk-auth.guard';
import { CapabilityGuard } from '../common/authorization/capability.guard';
import { PrismaService } from '../common/database/prisma.service';
import { ApiExceptionFilter } from '../common/errors/api-exception.filter';
import { ApiValidationPipe } from '../common/validation/validation.pipe';
import { BEARER_SECURITY_SCHEME, OPENAPI_VERSION, buildOpenApiDocument } from '../openapi';
import { PrivateResourceFixtureModule } from '../test/fixtures/private-resource.fixture';

/**
 * The profile is served only from the server-resolved local user. An obviously
 * sensitive Clerk subject is used so any accidental disclosure fails a test.
 */
const PROFILE_USER: AuthenticatedUser = Object.freeze({
  id: '11111111-1111-4111-8111-111111111111',
  clerkUserId: 'sub_SHOULD_NOT_BE_RETURNED',
  email: 'me@example.test',
  displayName: 'Me',
  capabilities: Object.freeze(['CUSTOMER', 'ADMIN'] as const),
});

const VERIFIED: VerifiedClerkIdentity = Object.freeze({
  clerkUserId: PROFILE_USER.clerkUserId,
  email: PROFILE_USER.email ?? '',
  displayName: PROFILE_USER.displayName ?? '',
  emailVerified: true,
});

function prismaStub(): PrismaService {
  return {
    onModuleInit: async (): Promise<void> => undefined,
    onModuleDestroy: async (): Promise<void> => undefined,
    $queryRaw: async (): Promise<Array<{ ok: boolean }>> => [{ ok: true }],
  } as unknown as PrismaService;
}

describe('identity API — current profile and OpenAPI baseline (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const verifier = { verify: vi.fn(async (): Promise<VerifiedClerkIdentity> => VERIFIED) };
    const resolver = {
      resolveVerifiedIdentity: vi.fn(async () => ({ user: PROFILE_USER, created: false })),
    };
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prismaStub())
      .overrideProvider(CLERK_TOKEN_VERIFIER)
      .useValue(verifier)
      .overrideProvider(IDENTITY_RESOLVER)
      .useValue(resolver)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ApiValidationPipe());
    app.useGlobalFilters(new ApiExceptionFilter({ error: (): void => undefined }));
    app.useGlobalGuards(moduleRef.get(ClerkAuthGuard), moduleRef.get(CapabilityGuard));
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns the stable local id, email, display name and capabilities from GET /users/me', async () => {
    const response = await request(app.getHttpServer())
      .get('/users/me')
      .set('Authorization', 'Bearer valid.token')
      .expect(200);

    expect(response.body).toEqual({
      id: PROFILE_USER.id,
      email: 'me@example.test',
      displayName: 'Me',
      capabilities: ['CUSTOMER', 'ADMIN'],
    });
  });

  it('excludes the Clerk subject, tombstone and internal provider fields', async () => {
    const response = await request(app.getHttpServer())
      .get('/users/me')
      .set('Authorization', 'Bearer valid.token')
      .expect(200);

    expect(JSON.stringify(response.body)).not.toContain(PROFILE_USER.clerkUserId);
    for (const forbidden of [
      'clerkUserId',
      'clerkSubject',
      'clerk_subject',
      'tombstone',
      'lifecycleStatus',
      'provider',
      'createdAt',
      'updatedAt',
      'audit',
    ]) {
      expect(response.body).not.toHaveProperty(forbidden);
    }
    expect(Object.keys(response.body).sort()).toEqual(['capabilities', 'displayName', 'email', 'id']);
  });

  it('emits a baseline OpenAPI document with bearer auth and the profile path, without freezing it', () => {
    const document = buildOpenApiDocument(app);

    expect(document.components?.securitySchemes?.[BEARER_SECURITY_SCHEME]).toBeDefined();
    expect(document.paths?.['/users/me']?.get).toBeDefined();
    expect(document.info.version).toBe(OPENAPI_VERSION);
    const serialized = JSON.stringify(document);
    expect(serialized).not.toContain(PROFILE_USER.clerkUserId);
    expect(serialized).not.toContain('sk_test');
  });

  it('denies an unauthenticated profile request', async () => {
    await request(app.getHttpServer()).get('/users/me').expect(401);
  });
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
  const root = mkdtempSync(resolve(tmpdir(), 'ecom-v1-authz-pg-'));
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
    '-c', 'CREATE DATABASE ecom_authz_test;',
  ]);
  return {
    url: `postgresql://postgres@127.0.0.1:${port}/ecom_authz_test`,
    stop(): void {
      try {
        run('pg_ctl', ['-D', dataDir, '-m', 'fast', '-w', 'stop']);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
  };
}

/**
 * Real-PostgreSQL role and ownership denials. The fixture controller is a
 * test-only module and is NEVER imported by the production AppModule.
 */
describe('identity API — role and ownership denials (real PostgreSQL)', () => {
  let prisma: PrismaService;
  let disposable: DisposableCluster | undefined;
  let app: INestApplication | undefined;
  let orderId: string;
  let ownerId: string;
  let otherId: string;
  let adminId: string;

  const TOKEN_SUBJECTS: Readonly<Record<string, string>> = Object.freeze({
    'owner-token': 'sub-owner',
    'other-token': 'sub-other',
    'admin-token': 'sub-admin',
  });

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
    process.env['ADMIN_EMAILS'] = 'owner@example.test';
    process.env['TOMBSTONE_SECRET'] = 'test-tombstone-hmac-secret';
    prisma = new PrismaService();
    await prisma.onModuleInit();
  });

  afterAll(async () => {
    await prisma?.onModuleDestroy();
    disposable?.stop();
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE lifecycle_events, orders, stores, user_capabilities, ' +
        'identity_tombstones, gallery_assets, users RESTART IDENTITY',
    );

    const owner = await prisma.user.create({
      data: {
        clerkSubject: 'sub-owner',
        email: 'owner@example.test',
        displayName: 'Owner',
        capabilities: { create: [{ capability: 'CUSTOMER' }] },
      },
      select: { id: true },
    });
    const other = await prisma.user.create({
      data: {
        clerkSubject: 'sub-other',
        email: 'other@example.test',
        displayName: 'Other',
        capabilities: { create: [{ capability: 'CUSTOMER' }] },
      },
      select: { id: true },
    });
    const admin = await prisma.user.create({
      data: {
        clerkSubject: 'sub-admin',
        email: 'admin@example.test',
        displayName: 'Admin',
        capabilities: { create: [{ capability: 'CUSTOMER' }, { capability: 'ADMIN' }] },
      },
      select: { id: true },
    });
    ownerId = owner.id;
    otherId = other.id;
    adminId = admin.id;

    const store = await prisma.store.create({
      data: { ownerUserId: ownerId, name: 'Owner Store' },
      select: { id: true },
    });
    const order = await prisma.order.create({
      data: { buyerUserId: ownerId, storeId: store.id, status: 'PAID' },
      select: { id: true },
    });
    orderId = order.id;

    const verifier = {
      verify: vi.fn(async (token: string): Promise<VerifiedClerkIdentity> => {
        const clerkUserId = TOKEN_SUBJECTS[token];
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
    const resolver = {
      resolveVerifiedIdentity: vi.fn(async ({ identity }: { identity: VerifiedClerkIdentity }) => {
        const row = await prisma.user.findUnique({
          where: { clerkSubject: identity.clerkUserId },
          select: {
            id: true,
            clerkSubject: true,
            email: true,
            displayName: true,
            capabilities: { select: { capability: true } },
          },
        });
        if (row === null) throw new UnauthorizedException('Authentication is required.');
        const user: AuthenticatedUser = Object.freeze({
          id: row.id,
          clerkUserId: row.clerkSubject ?? '',
          email: row.email,
          displayName: row.displayName,
          capabilities: Object.freeze(
            row.capabilities.map((entry) => entry.capability as ApplicationCapability),
          ),
        });
        return { user, created: false };
      }),
    };

    // The test owns the real client's lifecycle. Give each Nest app a proxy
    // with no-op hooks so app.close() cannot end the shared pool; the model
    // delegates still execute against the real migrated database.
    const prismaForApp = {
      onModuleInit: async (): Promise<void> => undefined,
      onModuleDestroy: async (): Promise<void> => undefined,
      $queryRaw: prisma.$queryRaw.bind(prisma),
      user: prisma.user,
      order: prisma.order,
      store: prisma.store,
    } as unknown as PrismaService;

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule, PrivateResourceFixtureModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaForApp)
      .overrideProvider(CLERK_TOKEN_VERIFIER)
      .useValue(verifier)
      .overrideProvider(IDENTITY_RESOLVER)
      .useValue(resolver)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ApiValidationPipe());
    app.useGlobalFilters(new ApiExceptionFilter({ error: (): void => undefined }));
    app.useGlobalGuards(moduleRef.get(ClerkAuthGuard), moduleRef.get(CapabilityGuard));
    await app.init();
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('returns 401 for a protected route with no bearer token', async () => {
    await request(app!.getHttpServer()).get(`/private/orders/${orderId}`).expect(401);
  });

  it('returns 401 for an invalid bearer token', async () => {
    await request(app!.getHttpServer())
      .get(`/private/orders/${orderId}`)
      .set('Authorization', 'Bearer invalid.token')
      .expect(401);
  });

  it('rejects malformed resource input with 400', async () => {
    await request(app!.getHttpServer())
      .get('/private/orders/not-a-uuid')
      .set('Authorization', 'Bearer owner-token')
      .expect(400);
  });

  it('denies a customer an admin-only action with 403', async () => {
    await request(app!.getHttpServer())
      .post('/private/admin/action')
      .set('Authorization', 'Bearer owner-token')
      .expect(403);
  });

  it('allows an admin the same admin-only action', async () => {
    const response = await request(app!.getHttpServer())
      .post('/private/admin/action')
      .set('Authorization', 'Bearer admin-token')
      .expect(201);
    expect(response.body).toEqual({ ok: true, actorId: adminId });
  });

  it('does not grant admin from client-supplied role or owner fields', async () => {
    await request(app!.getHttpServer())
      .post('/private/admin/action')
      .set('Authorization', 'Bearer owner-token')
      .send({ capability: 'ADMIN', capabilities: ['ADMIN'], role: 'ADMIN', userId: adminId })
      .expect(403);
  });

  it('lets a buyer read their own retained order', async () => {
    const response = await request(app!.getHttpServer())
      .get(`/private/orders/${orderId}`)
      .set('Authorization', 'Bearer owner-token')
      .expect(200);
    expect(response.body).toMatchObject({ id: orderId, buyerUserId: ownerId, status: 'PAID' });
    // The other user's id proves the row came from a real owner-scoped query.
    expect(response.body.buyerUserId).not.toBe(otherId);
  });

  it('returns a non-disclosing 404 with no row data for another user\'s order', async () => {
    const response = await request(app!.getHttpServer())
      .get(`/private/orders/${orderId}`)
      .set('Authorization', 'Bearer other-token')
      .expect(404);
    expect(JSON.stringify(response.body)).not.toContain(orderId);
    expect(response.body).not.toHaveProperty('buyerUserId');
    expect(response.body).not.toHaveProperty('status');
  });
});

describe('Clerk session configuration documentation', () => {
  it('documents the exact required headings and signed claim names', () => {
    const doc = readFileSync(
      resolve(__dirname, '../../../../docs/identity/clerk-integration.md'),
      'utf8',
    );
    for (const heading of [
      '## Sign-up requirements',
      '## Session persistence',
      '## Sign-out',
      '## Signed claims',
      '## Authorized parties and bearer transport',
      '## No webhook provisioning',
      '## Phase 5 handoff',
      '## Live Clerk verification procedure',
    ]) {
      expect(doc).toContain(heading);
    }
    // Claim names must match the verifier's typed contract exactly.
    for (const claim of ['primaryEmail', 'displayName', 'emailVerified']) {
      expect(doc).toContain(claim);
    }
  });
});
