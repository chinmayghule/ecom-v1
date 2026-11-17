import { Body, Controller, Get, Post, type INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, type TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CLERK_TOKEN_VERIFIER,
  IDENTITY_RESOLVER,
  type AuthenticatedUser,
  type ClerkTokenVerifier,
  type IdentityResolver,
  type VerifiedClerkIdentity,
} from './auth.types';
import { ClerkAuthGuard } from './clerk-auth.guard';
import { CurrentUser } from './current-user.decorator';
import { IsPublic } from './is-public.decorator';

const VERIFIED: VerifiedClerkIdentity = Object.freeze({
  clerkUserId: 'user_verified',
  email: 'verified@example.test',
  displayName: 'Verified',
  emailVerified: true,
});

const SERVER_USER: AuthenticatedUser = Object.freeze({
  id: 'local-user-id',
  clerkUserId: 'user_verified',
  email: 'verified@example.test',
  displayName: 'Verified',
  capabilities: Object.freeze(['CUSTOMER'] as const),
});

@Controller('probe')
class ProbeController {
  @Get('protected')
  protected(@CurrentUser() user: AuthenticatedUser): Record<string, unknown> {
    return { id: user.id, capabilities: user.capabilities };
  }

  @Get('open')
  @IsPublic()
  open(): Record<string, unknown> {
    return { ok: true };
  }

  @Post('echo')
  echo(
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: AuthenticatedUser,
  ): Record<string, unknown> {
    return { id: user.id, userIdFromBody: body['userId'] ?? null };
  }
}

describe('ClerkAuthGuard (deny-by-default global guard)', () => {
  let app: INestApplication;
  let verifier: { verify: ReturnType<typeof vi.fn> };
  let resolver: { resolveVerifiedIdentity: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    verifier = { verify: vi.fn(async () => VERIFIED) };
    resolver = {
      resolveVerifiedIdentity: vi.fn(async () => ({ user: SERVER_USER, created: false })),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [ProbeController],
      providers: [
        ClerkAuthGuard,
        Reflector,
        { provide: CLERK_TOKEN_VERIFIER, useValue: verifier },
        { provide: IDENTITY_RESOLVER, useValue: resolver },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalGuards(moduleRef.get(ClerkAuthGuard));
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns 401 on a protected route with no bearer token', async () => {
    await request(app.getHttpServer()).get('/probe/protected').expect(401);
    expect(verifier.verify).not.toHaveBeenCalled();
  });

  it('attaches only the server-resolved local user, ignoring client identity fields', async () => {
    const response = await request(app.getHttpServer())
      .post('/probe/echo')
      .set('Authorization', 'Bearer valid.token')
      .set('x-user-id', 'attacker-id')
      .send({ userId: 'attacker-id', capabilities: ['ADMIN'] })
      .expect(200);

    expect(response.body).toEqual({ id: 'local-user-id', userIdFromBody: 'attacker-id' });
    expect(verifier.verify).toHaveBeenCalledWith('valid.token');
    expect(resolver.resolveVerifiedIdentity).toHaveBeenCalledWith({ identity: VERIFIED });
  });

  it('bypasses only explicitly public routes; unlisted routes stay protected', async () => {
    await request(app.getHttpServer()).get('/probe/open').expect(200);
    await request(app.getHttpServer()).get('/probe/protected').expect(401);
  });

  it('rejects ambiguous or non-bearer credentials without calling the verifier', async () => {
    for (const header of ['Basic dXNlcjpwYXNz', 'Bearer two tokens', 'Token abc', '']) {
      await request(app.getHttpServer())
        .get('/probe/protected')
        .set('Authorization', header)
        .expect(401);
    }
    expect(verifier.verify).not.toHaveBeenCalled();
  });

  it('fails closed when verification or identity resolution fails', async () => {
    verifier.verify.mockRejectedValueOnce(new UnauthorizedException());
    await request(app.getHttpServer())
      .get('/probe/protected')
      .set('Authorization', 'Bearer bad.token')
      .expect(401);

    resolver.resolveVerifiedIdentity.mockRejectedValueOnce(new Error('database down'));
    const response = await request(app.getHttpServer())
      .get('/probe/protected')
      .set('Authorization', 'Bearer valid.token')
      .expect(401);
    expect(response.body.code).toBe('UNAUTHENTICATED');
  });
});
