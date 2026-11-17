import { type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module';
import { PrismaService } from '../common/database/prisma.service';

/**
 * Baseline API harness. Each test owns its Nest application and closes it, so
 * the suite leaves no open handles for later real-PostgreSQL suites to inherit.
 */
describe('API application harness (e2e)', () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('initializes and closes the Nest application without open handles', async () => {
    // The harness proves wiring, not persistence; a stub keeps the single
    // PrismaService from opening a real connection during baseline init.
    const prismaStub = {
      onModuleInit: async (): Promise<void> => undefined,
      onModuleDestroy: async (): Promise<void> => undefined,
      $queryRaw: async (): Promise<Array<{ ok: boolean }>> => [{ ok: true }],
    } as unknown as PrismaService;

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaStub)
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();

    // Supertest-ready: getHttpServer() is the handle later API suites pass to
    // request(). No production endpoint is added just to obtain a green test.
    expect(app.getHttpAdapter()).toBeDefined();
    expect(app.getHttpServer()).toBeDefined();
  });
});
