import { defineConfig, env } from 'prisma/config';

/**
 * Prisma 7.10.1 CLI/migration configuration.
 *
 * The CLI auto-discovers `prisma7.config.ts` (confirmed against the pinned
 * 7.10.1 CLI). Migration commands use DIRECT_URL — a direct, non-pooled
 * connection — while the application runtime uses DATABASE_URL through the
 * pg adapter in PrismaService.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: env('DIRECT_URL') },
});
