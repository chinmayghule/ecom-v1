import { type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../app.module';
import {
  CLERK_TOKEN_VERIFIER,
  IDENTITY_RESOLVER,
  type AuthenticatedUser,
  type VerifiedClerkIdentity,
} from '../common/auth/auth.types';
import { ClerkAuthGuard } from '../common/auth/clerk-auth.guard';
import { CapabilityGuard } from '../common/authorization/capability.guard';
import { PrismaService } from '../common/database/prisma.service';
import { ApiExceptionFilter } from '../common/errors/api-exception.filter';
import { ApiValidationPipe } from '../common/validation/validation.pipe';
import {
  BEARER_SECURITY_SCHEME,
  OPENAPI_VERSION,
  buildOpenApiDocument,
} from '../openapi';

/**
 * The profile is served only from the server-resolved local user. An obviously
 * sensitive Clerk subject is used so any accidental disclosure fails a test.
 */
const PROFILE_USER: AuthenticatedUser = Object.freeze({
  id: '11111111-1111-4111-8111-111111111111',
  clerkUserId: 'sub_SHOULD_NOT_BE_RETURNED',
  email: 'me@example.test',
  displayName: 'Me',
  capabilities: Object.freeze(['CUSTOMER', 'ADMIN'] as const),
});

const VERIFIED: VerifiedClerkIdentity = Object.freeze({
  clerkUserId: PROFILE_USER.clerkUserId,
  email: PROFILE_USER.email ?? '',
  displayName: PROFILE_USER.displayName ?? '',
  emailVerified: true,
});

describe('identity API — current profile and OpenAPI baseline (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const verifier = { verify: vi.fn(async (): Promise<VerifiedClerkIdentity> => VERIFIED) };
    const resolver = {
      resolveVerifiedIdentity: vi.fn(async () => ({ user: PROFILE_USER, created: false })),
    };
    const prismaStub = {
      onModuleInit: async (): Promise<void> => undefined,
      onModuleDestroy: async (): Promise<void> => undefined,
      $queryRaw: async (): Promise<Array<{ ok: boolean }>> => [{ ok: true }],
    } as unknown as PrismaService;

    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prismaStub)
      .overrideProvider(CLERK_TOKEN_VERIFIER)
      .useValue(verifier)
      .overrideProvider(IDENTITY_RESOLVER)
      .useValue(resolver)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ApiValidationPipe());
    app.useGlobalFilters(new ApiExceptionFilter({ error: (): void => undefined }));
    app.useGlobalGuards(moduleRef.get(ClerkAuthGuard), moduleRef.get(CapabilityGuard));
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns the stable local id, email, display name and capabilities from GET /users/me', async () => {
    const response = await request(app.getHttpServer())
      .get('/users/me')
      .set('Authorization', 'Bearer valid.token')
      .expect(200);

    expect(response.body).toEqual({
      id: PROFILE_USER.id,
      email: 'me@example.test',
      displayName: 'Me',
      capabilities: ['CUSTOMER', 'ADMIN'],
    });
  });

  it('excludes the Clerk subject, tombstone and internal provider fields', async () => {
    const response = await request(app.getHttpServer())
      .get('/users/me')
      .set('Authorization', 'Bearer valid.token')
      .expect(200);

    expect(JSON.stringify(response.body)).not.toContain(PROFILE_USER.clerkUserId);
    for (const forbidden of [
      'clerkUserId',
      'clerkSubject',
      'clerk_subject',
      'tombstone',
      'lifecycleStatus',
      'provider',
      'createdAt',
      'updatedAt',
      'audit',
    ]) {
      expect(response.body).not.toHaveProperty(forbidden);
    }
    expect(Object.keys(response.body).sort()).toEqual(['capabilities', 'displayName', 'email', 'id']);
  });

  it('emits a baseline OpenAPI document with bearer auth and the profile path, without freezing it', () => {
    const document = buildOpenApiDocument(app);

    expect(document.components?.securitySchemes?.[BEARER_SECURITY_SCHEME]).toBeDefined();
    expect(document.paths?.['/users/me']?.get).toBeDefined();
    expect(document.info.version).toBe(OPENAPI_VERSION);
    const serialized = JSON.stringify(document);
    expect(serialized).not.toContain(PROFILE_USER.clerkUserId);
    expect(serialized).not.toContain('sk_test');
  });

  it('denies an unauthenticated profile request', async () => {
    await request(app.getHttpServer()).get('/users/me').expect(401);
  });
});
