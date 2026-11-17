import { defineConfig } from 'prisma/config';

/**
 * Prisma 7.10.1 CLI/migration configuration.
 *
 * The CLI auto-discovers `prisma7.config.ts` (confirmed against the pinned
 * 7.10.1 CLI). Migration commands use DIRECT_URL — a direct, non-pooled
 * connection — while the application runtime uses DATABASE_URL through the
 * pg adapter in PrismaService.
 *
 * The datasource is only configured when DIRECT_URL is present so that
 * `prisma generate` (which needs no connection) works without a database;
 * migrate commands still fail clearly when the URL is absent.
 */
const directUrl = process.env['DIRECT_URL'];

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  ...(directUrl ? { datasource: { url: directUrl } } : {}),
});
