import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { UnauthorizedException } from '@nestjs/common';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { VerifiedClerkIdentity } from '../common/auth/auth.types';
import { PrismaService } from '../common/database/prisma.service';
import { IdentityRepository, subjectDigestFor } from './identity.repository';
import { IdentityService } from './identity.service';

/**
 * Real-PostgreSQL provisioning tests. No repository or SQL behaviour is
 * mocked: a disposable local cluster is provisioned and the committed
 * migration is applied before the service is exercised.
 */
const TEST_IDENTITY_CONFIG = {
  adminEmails: ['owner@example.test'],
  tombstoneSecret: 'test-tombstone-hmac-secret',
} as const;

interface DisposableCluster {
  readonly url: string;
  stop(): void;
}

let databaseUrl: string;
let disposable: DisposableCluster | undefined;
let prisma: PrismaService;
let service: IdentityService;

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
  const root = mkdtempSync(resolve(tmpdir(), 'ecom-v1-identity-pg-'));
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
    '-c', 'CREATE DATABASE ecom_identity_test;',
  ]);
  return {
    url: `postgresql://postgres@127.0.0.1:${port}/ecom_identity_test`,
    stop(): void {
      try {
        run('pg_ctl', ['-D', dataDir, '-m', 'fast', '-w', 'stop']);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
  };
}

function identity(overrides: Partial<VerifiedClerkIdentity> = {}): VerifiedClerkIdentity {
  return {
    clerkUserId: 'sub-default',
    email: 'default@example.test',
    displayName: 'Default',
    emailVerified: true,
    ...overrides,
  };
}

beforeAll(async () => {
  const external = process.env['TEST_DATABASE_URL'];
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

  // beforeAll runs before the shared setup file's per-test defaults, so set
  // every required variable explicitly before constructing PrismaService.
  process.env['DATABASE_URL'] = databaseUrl;
  process.env['DIRECT_URL'] = databaseUrl;
  process.env['CLERK_SECRET_KEY'] = 'sk_test_placeholder';
  process.env['CLERK_JWT_KEY'] = 'jwt_test_placeholder';
  process.env['CLERK_WEB_ORIGIN'] = 'http://localhost:3000';
  process.env['CLERK_ISSUER'] = 'https://clerk.example.test';
  process.env['CLERK_AUDIENCE'] = 'clerk.example.test';
  process.env['ADMIN_EMAILS'] = 'owner@example.test';
  process.env['TOMBSTONE_SECRET'] = 'test-tombstone-hmac-secret';
  prisma = new PrismaService();
  await prisma.onModuleInit();
  service = new IdentityService(new IdentityRepository(prisma), TEST_IDENTITY_CONFIG);
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
});

describe('IdentityService.resolveVerifiedIdentity (real PostgreSQL)', () => {
  it('creates exactly one local user and one customer baseline under concurrent first requests', async () => {
    const verified = identity({
      clerkUserId: 'sub-race-1',
      email: 'race@example.test',
      displayName: 'Race',
    });
    const results = await Promise.all(
      Array.from({ length: 8 }, () => service.resolveVerifiedIdentity({ identity: verified })),
    );

    const users = await prisma.user.findMany({
      where: { clerkSubject: verified.clerkUserId },
      select: { id: true, capabilities: { select: { capability: true } } },
    });
    expect(users).toHaveLength(1);
    expect(new Set(results.map((result) => result.user.id)).size).toBe(1);
    expect(results.filter((result) => result.created)).toHaveLength(1);
    expect(users[0]?.capabilities.map((row) => row.capability)).toEqual(['CUSTOMER']);
  });

  it('grants admin on first create only for a verified allowlisted email', async () => {
    const admin = await service.resolveVerifiedIdentity({
      identity: identity({
        clerkUserId: 'sub-admin-1',
        email: ' OWNER@Example.test ',
        displayName: 'Owner',
        emailVerified: true,
      }),
    });
    expect(admin.user.capabilities).toEqual(['CUSTOMER', 'ADMIN']);

    const unverified = await service.resolveVerifiedIdentity({
      identity: identity({
        clerkUserId: 'sub-admin-2',
        email: 'owner@example.test',
        displayName: 'Unverified',
        emailVerified: false,
      }),
    });
    expect(unverified.user.capabilities).toEqual(['CUSTOMER']);

    const nonMatching = await service.resolveVerifiedIdentity({
      identity: identity({
        clerkUserId: 'sub-admin-3',
        email: 'other@example.test',
        displayName: 'Other',
        emailVerified: true,
      }),
    });
    expect(nonMatching.user.capabilities).toEqual(['CUSTOMER']);
  });

  it('refreshes local profile copies but never grants or revokes admin on later requests', async () => {
    const plain = await service.resolveVerifiedIdentity({
      identity: identity({
        clerkUserId: 'sub-refresh-1',
        email: 'plain@example.test',
        displayName: 'Plain',
      }),
    });
    expect(plain.user.capabilities).not.toContain('ADMIN');

    const promotedByEmail = await service.resolveVerifiedIdentity({
      identity: identity({
        clerkUserId: 'sub-refresh-1',
        email: 'owner@example.test',
        displayName: 'Renamed',
      }),
    });
    expect(promotedByEmail.created).toBe(false);
    expect(promotedByEmail.user.email).toBe('owner@example.test');
    expect(promotedByEmail.user.displayName).toBe('Renamed');
    expect(promotedByEmail.user.capabilities).not.toContain('ADMIN');

    const admin = await service.resolveVerifiedIdentity({
      identity: identity({
        clerkUserId: 'sub-refresh-2',
        email: 'owner@example.test',
        displayName: 'Admin',
      }),
    });
    await service.resolveVerifiedIdentity({
      identity: identity({
        clerkUserId: 'sub-refresh-2',
        email: 'changed@example.test',
        displayName: 'Admin Renamed',
      }),
    });
    const capabilities = await prisma.userCapability.findMany({
      where: { userId: admin.user.id },
      select: { capability: true },
    });
    expect(capabilities.map((row) => row.capability)).toContain('ADMIN');

    await service.revokeCapability(admin.user.id, 'ADMIN');
    expect(
      (await prisma.userCapability.findMany({
        where: { userId: admin.user.id, capability: 'ADMIN' },
        select: { capability: true },
      })),
    ).toHaveLength(0);

    await service.grantCapability(admin.user.id, 'ADMIN');
    expect(
      (await prisma.userCapability.findMany({
        where: { userId: admin.user.id, capability: 'ADMIN' },
        select: { capability: true },
      })),
    ).toHaveLength(1);
  });

  it('denies a tombstoned subject before provisioning and stores no raw subject in the tombstone', async () => {
    const subject = 'sub-deleted-1';
    const digest = subjectDigestFor(subject, TEST_IDENTITY_CONFIG.tombstoneSecret);
    await prisma.identityTombstone.create({ data: { subjectDigest: digest } });

    await expect(
      service.resolveVerifiedIdentity({
        identity: identity({
          clerkUserId: subject,
          email: 'deleted@example.test',
          displayName: 'Deleted',
        }),
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(await prisma.user.count({ where: { clerkSubject: subject } })).toBe(0);
    const columns = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'identity_tombstones'
    `;
    const names = columns.map((row) => row.column_name);
    expect(names).toContain('subject_digest');
    expect(names.some((name) => name.includes('email'))).toBe(false);
    expect(names).not.toContain('clerk_subject');
  });

  it('accepts NULL profile columns for anonymization while live accounts are populated', async () => {
    const live = await service.resolveVerifiedIdentity({
      identity: identity({
        clerkUserId: 'sub-live-1',
        email: 'live@example.test',
        displayName: 'Live',
      }),
    });
    expect(typeof live.user.email).toBe('string');
    expect(typeof live.user.displayName).toBe('string');

    // The D-07 path clears PII while retaining the stable user id.
    const anonymized = await prisma.user.create({
      data: {
        clerkSubject: null,
        email: null,
        displayName: null,
        lifecycleStatus: 'ANONYMIZED',
      },
      select: { id: true, email: true, displayName: true },
    });
    expect(anonymized.email).toBeNull();
    expect(anonymized.displayName).toBeNull();
    expect(anonymized.id).toBeTruthy();
  });
});
