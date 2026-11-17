import { type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module';

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
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    // Supertest-ready: getHttpServer() is the handle later API suites pass to
    // request(). No production endpoint is added just to obtain a green test.
    expect(app.getHttpAdapter()).toBeDefined();
    expect(app.getHttpServer()).toBeDefined();
  });
});
