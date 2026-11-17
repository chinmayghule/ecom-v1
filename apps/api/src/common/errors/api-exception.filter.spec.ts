import {
  Controller,
  ForbiddenException,
  Get,
  HttpException,
  NotFoundException,
  type INestApplication,
  UnauthorizedException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { ApiExceptionFilter, type ExceptionSink } from './api-exception.filter';

/**
 * API-boundary tests for the one sanitized error envelope (threat T-05-02).
 * Each thrown exception deliberately carries a sensitive-looking detail that
 * must never reach the client, only the server-side error sink.
 */

const LEAK_MARKERS = [
  'hunter2',
  'sk_test_secret',
  'SELECT * FROM users',
  'at ErrorsController.',
  'postgres://',
] as const;

@Controller('errors')
class ErrorsController {
  @Get('bad-request')
  badRequest(): never {
    throw new BadRequestException('malformed field: SELECT * FROM users');
  }

  @Get('unauthenticated')
  unauthenticated(): never {
    throw new UnauthorizedException('bearer sk_test_secret');
  }

  @Get('forbidden')
  forbidden(): never {
    throw new ForbiddenException('user hunter2 is not permitted');
  }

  @Get('not-found')
  notFound(): never {
    throw new NotFoundException('postgres://internal/db leaked');
  }

  @Get('conflict')
  conflict(): never {
    throw new ConflictException('duplicate key on unique index hunter2');
  }

  @Get('unexpected')
  unexpected(): never {
    throw new Error('SELECT * FROM users with password hunter2 at ErrorsController.unexpected');
  }

  @Get('unmapped')
  unmapped(): never {
    throw new HttpException('teapot sk_test_secret', 418);
  }
}

interface CapturedError {
  readonly payload: Record<string, unknown>;
  readonly message: string;
}

describe('global sanitized exception filter', () => {
  let app: INestApplication | undefined;
  let captured: CapturedError[];

  const sink: ExceptionSink = {
    error(payload: Record<string, unknown>, message: string): void {
      captured.push({ payload, message });
    },
  };

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  async function buildApp(): Promise<INestApplication> {
    captured = [];
    const moduleRef = await Test.createTestingModule({
      controllers: [ErrorsController],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new ApiExceptionFilter(sink));
    await app.init();
    return app;
  }

  function expectSanitizedEnvelope(body: Record<string, unknown>): void {
    const serialized = JSON.stringify(body);
    for (const marker of LEAK_MARKERS) {
      expect(serialized).not.toContain(marker);
    }
    expect(typeof body['statusCode']).toBe('number');
    expect(typeof body['code']).toBe('string');
    expect(typeof body['message']).toBe('string');
    expect(typeof body['requestId']).toBe('string');
  }

  const cases: ReadonlyArray<{
    route: string;
    status: number;
    code: string;
  }> = [
    { route: 'bad-request', status: 400, code: 'BAD_REQUEST' },
    { route: 'unauthenticated', status: 401, code: 'UNAUTHENTICATED' },
    { route: 'forbidden', status: 403, code: 'FORBIDDEN' },
    { route: 'not-found', status: 404, code: 'NOT_FOUND' },
    { route: 'conflict', status: 409, code: 'CONFLICT' },
    { route: 'unexpected', status: 500, code: 'INTERNAL_ERROR' },
    { route: 'unmapped', status: 418, code: 'HTTP_ERROR' },
  ];

  for (const testCase of cases) {
    it(`maps ${testCase.route} to a stable ${testCase.status}/${testCase.code} envelope`, async () => {
      await buildApp();
      const response = await request(app!.getHttpServer())
        .get(`/errors/${testCase.route}`)
        .expect(testCase.status);

      expect(response.body).toMatchObject({
        statusCode: testCase.status,
        code: testCase.code,
      });
      expectSanitizedEnvelope(response.body as Record<string, unknown>);
    });
  }

  it('keeps unexpected error detail only in the server-side error sink', async () => {
    await buildApp();
    await request(app!.getHttpServer()).get('/errors/unexpected').expect(500);

    expect(captured).toHaveLength(1);
    expect(JSON.stringify(captured[0])).toContain('hunter2');
    expect(JSON.stringify(captured[0])).toContain('SELECT * FROM users');
  });

  it('correlates the error envelope with the incoming request id', async () => {
    await buildApp();
    const response = await request(app!.getHttpServer())
      .get('/errors/unexpected')
      .set('x-request-id', 'req-correlation-42')
      .expect(500);

    expect(response.body).toMatchObject({ requestId: 'req-correlation-42' });
  });

  it('does not echo a caller-supplied request id that is not a safe token', async () => {
    await buildApp();
    const response = await request(app!.getHttpServer())
      .get('/errors/unexpected')
      .set('x-request-id', `x-${'a'.repeat(300)} with spaces`)
      .expect(500);

    const requestId = String(response.body['requestId']);
    expect(requestId.length).toBeLessThanOrEqual(128);
    expect(requestId).not.toContain(' ');
    expect(requestId).toMatch(/^[0-9a-f-]{36}$/);
  });
});
