import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  type INestApplication,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { IsEmail, IsString, MinLength } from 'class-validator';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ApiExceptionFilter, type ExceptionSink } from '../errors/api-exception.filter';
import { ApiValidationPipe } from './validation.pipe';

/**
 * API-boundary tests for the one global validation policy (threat T-05-01).
 * The pipe is registered exactly as production registers it, with the global
 * error filter so the response shape is observed too.
 */

class CreateThingDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsEmail()
  email!: string;
}

class ListThingsQueryDto {
  @IsString()
  search!: string;
}

class ThingParamDto {
  @IsString()
  id!: string;
}

/** A DTO with no declared fields — any incoming field must be rejected. */
class EmptyDto {}

let controllerCalls = 0;

@Controller('things')
class ThingsController {
  @Post()
  create(@Body() body: CreateThingDto): object {
    controllerCalls += 1;
    return { ok: true, name: body.name, email: body.email };
  }

  @Get()
  list(@Query() query: ListThingsQueryDto): object {
    controllerCalls += 1;
    return { ok: true, search: query.search };
  }

  @Get(':id/:extra')
  withExtraParam(@Param() params: ThingParamDto): object {
    controllerCalls += 1;
    return { ok: true, id: params.id };
  }

  @Post('raw')
  raw(@Body() body: EmptyDto): object {
    controllerCalls += 1;
    return { ok: true, body };
  }
}

const silentSink: ExceptionSink = {
  error(): void {
    /* error detail is asserted in api-exception.filter.spec.ts */
  },
};

describe('global API validation boundary', () => {
  let app: INestApplication;

  beforeEach(() => {
    controllerCalls = 0;
  });

  afterEach(async () => {
    await app?.close();
  });

  async function buildApp(): Promise<INestApplication> {
    const moduleRef = await Test.createTestingModule({
      controllers: [ThingsController],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ApiValidationPipe());
    app.useGlobalFilters(new ApiExceptionFilter(silentSink));
    await app.init();
    return app;
  }

  it('rejects an undeclared body field with 400 before the controller runs', async () => {
    await buildApp();
    const response = await request(app.getHttpServer())
      .post('/things')
      .send({ name: 'Widget', email: 'owner@example.test', injectedField: 'x' })
      .expect(400);

    expect(response.body).toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(controllerCalls).toBe(0);
  });

  it('rejects an undeclared query field with 400 before the controller runs', async () => {
    await buildApp();
    const response = await request(app.getHttpServer())
      .get('/things?search=widget&injectedField=x')
      .expect(400);

    expect(response.body).toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(controllerCalls).toBe(0);
  });

  it('rejects an undeclared path parameter with 400 before the controller runs', async () => {
    await buildApp();
    const response = await request(app.getHttpServer())
      .get('/things/abc/unexpected')
      .expect(400);

    expect(response.body).toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(controllerCalls).toBe(0);
  });

  it('rejects an unknown (unvalidated) value shape with 400', async () => {
    await buildApp();
    await request(app.getHttpServer())
      .post('/things/raw')
      .send({ anything: true })
      .expect(400);
    expect(controllerCalls).toBe(0);
  });

  it('rejects a DTO that fails a class-validator rule', async () => {
    await buildApp();
    const response = await request(app.getHttpServer())
      .post('/things')
      .send({ name: 'W', email: 'not-an-email' })
      .expect(400);

    expect(response.body).toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(controllerCalls).toBe(0);
  });

  it('transforms and passes a valid DTO through to the controller', async () => {
    await buildApp();
    const response = await request(app.getHttpServer())
      .post('/things')
      .send({ name: 'Widget', email: 'owner@example.test' })
      .expect(201);

    expect(response.body).toEqual({
      ok: true,
      name: 'Widget',
      email: 'owner@example.test',
    });
    expect(controllerCalls).toBe(1);
  });
});
