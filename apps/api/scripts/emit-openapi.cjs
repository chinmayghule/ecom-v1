/*
 * Emit the single deterministic OpenAPI baseline artifact for local inspection.
 *
 * It boots the real AppModule with a stubbed PrismaService and placeholder
 * environment values (no database connection, no Clerk call), reuses the one
 * OpenAPI assembler from dist/openapi.js, and writes to a gitignored location.
 * Phase 4 owns the contract freeze and the generated frontend client.
 */
'use strict';

require('reflect-metadata');

const { mkdirSync, writeFileSync } = require('node:fs');
const { dirname, resolve } = require('node:path');
const { Test } = require('@nestjs/testing');

const TEST_ENV = {
  DATABASE_URL: 'postgresql://test@127.0.0.1:5432/ecom_test',
  DIRECT_URL: 'postgresql://test@127.0.0.1:5432/ecom_test',
  CLERK_SECRET_KEY: 'sk_test_placeholder',
  CLERK_JWT_KEY: 'jwt_test_placeholder',
  CLERK_WEB_ORIGIN: 'http://localhost:3000',
  CLERK_ISSUER: 'https://clerk.example.test',
  CLERK_AUDIENCE: 'clerk.example.test',
  ADMIN_EMAILS: 'owner@example.test',
  TOMBSTONE_SECRET: 'tombstone-test-placeholder',
};
for (const [key, value] of Object.entries(TEST_ENV)) {
  if (process.env[key] === undefined) process.env[key] = value;
}

const { AppModule } = require('../dist/app.module');
const { PrismaService } = require('../dist/common/database/prisma.service');
const { buildOpenApiDocument, serializeOpenApiBaseline } = require('../dist/openapi');

async function main() {
  const prismaStub = {
    onModuleInit: async () => undefined,
    onModuleDestroy: async () => undefined,
    $queryRaw: async () => [{ ok: true }],
  };
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PrismaService)
    .useValue(prismaStub)
    .compile();

  const app = moduleRef.createNestApplication();
  await app.init();
  try {
    const baseline = serializeOpenApiBaseline(buildOpenApiDocument(app));
    const outputPath = resolve(__dirname, '../.generated/openapi.baseline.json');
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, baseline, 'utf8');
    process.stdout.write(`OpenAPI baseline written to ${outputPath}\n`);
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${error && error.stack ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
