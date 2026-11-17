import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { PrismaService } from '../database/prisma.service';
import { AuthModule, buildCorsOptions } from './auth.module';
import { CLERK_TOKEN_VERIFIER } from './auth.types';
import { ClerkAuthGuard } from './clerk-auth.guard';
import { ClerkTokenVerifierService } from './clerk-token-verifier';

describe('AuthModule wiring', () => {
  it('provides the official verifier contract and the global guard', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AuthModule] })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();

    expect(moduleRef.get(CLERK_TOKEN_VERIFIER, { strict: false })).toBeInstanceOf(
      ClerkTokenVerifierService,
    );
    expect(moduleRef.get(ClerkAuthGuard, { strict: false })).toBeInstanceOf(ClerkAuthGuard);
  });

  it('builds an explicit CORS origin allowlist with credentials and no wildcard', () => {
    const options = buildCorsOptions(['http://localhost:3000', 'https://shop.example.test']);

    expect(options.origin).toEqual(['http://localhost:3000', 'https://shop.example.test']);
    expect(options.origin).not.toContain('*');
    expect(options.credentials).toBe(true);
    expect(options.allowedHeaders).toContain('Authorization');
  });

  it('never produces a wildcard origin when the configured list is malformed', () => {
    const options = buildCorsOptions([]);
    expect(options.origin).toEqual([]);
    expect(options.credentials).toBe(true);
  });
});
