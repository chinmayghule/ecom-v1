import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { validateEnv } from '../config/env.validation';

/**
 * Minimal structural type for the pg pool surface used here. `@types/pg` is
 * not in the authoritative Phase 1 dependency inventory (DEPENDENCIES.md).
 */
interface PgPoolOptions {
  connectionString?: string;
  max?: number;
  connectionTimeoutMillis?: number;
  idleTimeoutMillis?: number;
}
interface PgPool {
  readonly options: PgPoolOptions;
  readonly ending: boolean;
  end(): Promise<void>;
}
type PgPoolConstructor = new (config: PgPoolOptions) => PgPool;
const PgPoolCtor: PgPoolConstructor = (require('pg') as { Pool: PgPoolConstructor }).Pool;

/**
 * The one Nest-managed Prisma client for the API.
 *
 * Uses the pooled runtime DATABASE_URL through the pg driver adapter with an
 * explicit, conservative pool ceiling and acquisition/idle timeouts; fails
 * clearly instead of waiting indefinitely for a connection (T-04-05).
 * Migration commands never use this client — they use DIRECT_URL via the CLI
 * config. There is deliberately no generic BaseRepository or second client.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly pool: PgPool;

  constructor() {
    const config = validateEnv();
    const pool = new PgPoolCtor({
      connectionString: config.databaseUrl,
      max: config.databasePoolMax,
      connectionTimeoutMillis: config.databaseAcquireTimeoutMs,
      idleTimeoutMillis: config.databaseIdleTimeoutMs,
    });
    super({ adapter: new PrismaPg(pool as ConstructorParameters<typeof PrismaPg>[0]) });
    this.pool = pool;
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    await this.pool.end();
  }
}
