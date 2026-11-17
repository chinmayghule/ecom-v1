import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

/**
 * Minimal structural type for the node-postgres surface exercised here.
 * `@types/pg` is not in the authoritative Phase 1 dependency inventory
 * (DEPENDENCIES.md), so no extra type-only package is installed.
 */
interface PgClient {
  connect(): Promise<void>;
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: readonly unknown[],
  ): Promise<{ rows: T[] }>;
  end(): Promise<void>;
}
type PgClientConstructor = new (config: { connectionString: string }) => PgClient;
const PgClientCtor: PgClientConstructor = (require('pg') as { Client: PgClientConstructor }).Client;

/**
 * Real-PostgreSQL contract tests for the committed foundation migration.
 *
 * These tests never create tables ad hoc. When TEST_DATABASE_URL is supplied
 * (by scripts/test-migrations.sh) they use the already-migrated disposable
 * database. When run standalone they provision their own local disposable
 * cluster and apply the committed migration with psql. No SQL is mocked.
 */

interface DisposableCluster {
  readonly url: string;
  stop(): void;
}

let dbUrl: string;
let disposable: DisposableCluster | undefined;

function run(command: string, args: readonly string[]): string {
  const result = spawnSync(command, [...args], { encoding: 'utf8' });
  if (result.error) {
    throw result.error;
  }
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
  const root = mkdtempSync(resolve(tmpdir(), 'ecom-v1-schema-pg-'));
  const dataDir = resolve(root, 'data');
  mkdirSync(dataDir, { recursive: true });
  run('initdb', [
    '-D',
    dataDir,
    '--no-locale',
    '--encoding=UTF8',
    '--auth=trust',
    '-U',
    'postgres',
  ]);
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
    'CREATE DATABASE ecom_schema_test;',
  ]);
  return {
    url: `postgresql://postgres@127.0.0.1:${port}/ecom_schema_test`,
    stop(): void {
      try {
        run('pg_ctl', ['-D', dataDir, '-m', 'fast', '-w', 'stop']);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
  };
}

async function withClient<T>(work: (client: PgClient) => Promise<T>): Promise<T> {
  const client = new PgClientCtor({ connectionString: dbUrl });
  await client.connect();
  try {
    return await work(client);
  } finally {
    await client.end();
  }
}

async function expectPgError(work: () => Promise<unknown>, code: string): Promise<void> {
  try {
    await work();
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(Error);
    expect((error as { code?: string }).code).toBe(code);
    return;
  }
  throw new Error(`Expected PostgreSQL error with SQLSTATE ${code}`);
}

beforeAll(async () => {
  const externalUrl = process.env['TEST_DATABASE_URL'];
  if (externalUrl) {
    dbUrl = externalUrl;
    return;
  }
  disposable = provisionLocalCluster(await pickFreePort());
  dbUrl = disposable.url;
  const migrationPath = resolve(
    __dirname,
    '../../../prisma/migrations/0001_identity_foundation/migration.sql',
  );
  if (!existsSync(migrationPath)) {
    throw new Error(`Committed migration is missing: ${migrationPath}`);
  }
  run('psql', ['--no-psqlrc', '-q', '-v', 'ON_ERROR_STOP=1', '-f', migrationPath, dbUrl]);
});

afterAll(() => {
  disposable?.stop();
});

beforeEach(async () => {
  await withClient(async (client) => {
    await client.query(
      'TRUNCATE TABLE lifecycle_events, orders, stores, user_capabilities, ' +
        'identity_tombstones, gallery_assets, users RESTART IDENTITY',
    );
  });
});

describe('identity foundation migration on a real PostgreSQL database', () => {
  it('rejects a shared Clerk subject while a stable user id keeps its store and order references', async () => {
    await withClient(async (client) => {
      const user = await client.query<{ id: string }>(
        "INSERT INTO users (clerk_subject, email, display_name, lifecycle_status) " +
          "VALUES ('sub-shared-1', 'one@example.test', 'One', 'ACTIVE') RETURNING id",
      );
      const userId = user.rows[0]!.id;

      await expectPgError(
        () =>
          client.query(
            "INSERT INTO users (clerk_subject, email, display_name) " +
              "VALUES ('sub-shared-1', 'two@example.test', 'Two')",
          ),
        '23505',
      );

      const store = await client.query<{ id: string }>(
        "INSERT INTO stores (owner_user_id, name) VALUES ($1, 'Retained Store') RETURNING id",
        [userId],
      );
      const storeId = store.rows[0]!.id;
      const order = await client.query<{ id: string }>(
        "INSERT INTO orders (buyer_user_id, store_id, status) VALUES ($1, $2, 'PAID') RETURNING id",
        [userId, storeId],
      );
      const orderId = order.rows[0]!.id;

      await client.query(
        "UPDATE users SET clerk_subject = NULL, email = NULL, display_name = NULL, " +
          "lifecycle_status = 'ANONYMIZED' WHERE id = $1",
        [userId],
      );

      const retainedOrder = await client.query<{ buyer_user_id: string; store_id: string }>(
        'SELECT buyer_user_id, store_id FROM orders WHERE id = $1',
        [orderId],
      );
      expect(retainedOrder.rows[0]).toMatchObject({
        buyer_user_id: userId,
        store_id: storeId,
      });
      const retainedStore = await client.query<{ owner_user_id: string }>(
        'SELECT owner_user_id FROM stores WHERE id = $1',
        [storeId],
      );
      expect(retainedStore.rows[0]?.owner_user_id).toBe(userId);
    });
  });

  it('lets a user hold only one instance of an application capability', async () => {
    await withClient(async (client) => {
      const user = await client.query<{ id: string }>(
        "INSERT INTO users (clerk_subject, email, display_name) " +
          "VALUES ('sub-cap-1', 'cap@example.test', 'Cap') RETURNING id",
      );
      const userId = user.rows[0]!.id;
      await client.query('INSERT INTO user_capabilities (user_id, capability) VALUES ($1, $2)', [
        userId,
        'MERCHANT',
      ]);
      await expectPgError(
        () =>
          client.query('INSERT INTO user_capabilities (user_id, capability) VALUES ($1, $2)', [
            userId,
            'MERCHANT',
          ]),
        '23505',
      );
      await client.query('INSERT INTO user_capabilities (user_id, capability) VALUES ($1, $2)', [
        userId,
        'ADMIN',
      ]);
      const capabilities = await client.query<{ capability: string }>(
        'SELECT capability FROM user_capabilities WHERE user_id = $1 ORDER BY capability',
        [userId],
      );
      // PostgreSQL orders enum values by declaration order, not alphabetically.
      expect(capabilities.rows.map((row) => row.capability).sort()).toEqual(['ADMIN', 'MERCHANT']);
    });
  });

  it('blocks destructive deletion of a user referenced by a store or an order', async () => {
    await withClient(async (client) => {
      const user = await client.query<{ id: string }>(
        "INSERT INTO users (clerk_subject, email, display_name) " +
          "VALUES ('sub-restrict-1', 'restrict@example.test', 'Restrict') RETURNING id",
      );
      const userId = user.rows[0]!.id;
      const store = await client.query<{ id: string }>(
        "INSERT INTO stores (owner_user_id, name) VALUES ($1, 'Restricted Store') RETURNING id",
        [userId],
      );
      const storeId = store.rows[0]!.id;
      await client.query(
        "INSERT INTO orders (buyer_user_id, store_id, status) VALUES ($1, $2, 'SHIPPED')",
        [userId, storeId],
      );

      // ON DELETE RESTRICT reports SQLSTATE 23001 (restrict_violation).
      await expectPgError(() => client.query('DELETE FROM users WHERE id = $1', [userId]), '23001');
      await expectPgError(() => client.query('DELETE FROM stores WHERE id = $1', [storeId]), '23001');

      const stillThere = await client.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM users WHERE id = $1',
        [userId],
      );
      expect(stillThere.rows[0]?.count).toBe('1');
    });
  });

  it('keeps the tombstone subject digest unique without storing raw Clerk identifiers', async () => {
    await withClient(async (client) => {
      const digest = 'a'.repeat(64);
      await client.query(
        'INSERT INTO identity_tombstones (subject_digest) VALUES ($1)',
        [digest],
      );
      await expectPgError(
        () => client.query('INSERT INTO identity_tombstones (subject_digest) VALUES ($1)', [digest]),
        '23505',
      );

      const columns = await client.query<{ column_name: string }>(
        "SELECT column_name FROM information_schema.columns " +
          "WHERE table_schema = 'public' AND table_name = 'identity_tombstones'",
      );
      const names = columns.rows.map((row) => row.column_name);
      expect(names).toContain('subject_digest');
      expect(names.some((name) => name.includes('email'))).toBe(false);
      expect(names.some((name) => name === 'clerk_subject')).toBe(false);
    });
  });

  it('holds at least 200 curated gallery asset records with metadata and soft deactivation', async () => {
    await withClient(async (client) => {
      await client.query(
        'INSERT INTO gallery_assets (source_url, display_name, category, tags) ' +
          "SELECT 'https://images.example.test/' || g, 'Curated ' || g, 'curated', " +
          "ARRAY['seed']::text[] FROM generate_series(1, 200) AS g",
      );
      const count = await client.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM gallery_assets',
      );
      expect(Number(count.rows[0]!.count)).toBeGreaterThanOrEqual(200);

      await client.query(
        "UPDATE gallery_assets SET deactivated_at = now() WHERE display_name = 'Curated 1'",
      );
      const deactivated = await client.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM gallery_assets WHERE deactivated_at IS NOT NULL',
      );
      expect(deactivated.rows[0]?.count).toBe('1');
    });
  });

  it('treats the lifecycle event log as append-only', async () => {
    await withClient(async (client) => {
      const event = await client.query<{ id: string }>(
        "INSERT INTO lifecycle_events (event_type, outcome) VALUES ('PROFILE_ANONYMIZED', 'OK') RETURNING id",
      );
      const eventId = event.rows[0]!.id;

      await expectPgError(
        () => client.query("UPDATE lifecycle_events SET outcome = 'CHANGED' WHERE id = $1", [eventId]),
        'P0001',
      );
      await expectPgError(
        () => client.query('DELETE FROM lifecycle_events WHERE id = $1', [eventId]),
        'P0001',
      );
    });
  });
});
