import {
  Body,
  Controller,
  type CanActivate,
  type ExecutionContext,
  Get,
  type INestApplication,
  Post,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { CapabilityGuard, hasRequiredCapability } from './capability.guard';
import { RequireCapability } from './require-capability.decorator';

const CUSTOMER: AuthenticatedUser = Object.freeze({
  id: 'local-customer',
  clerkUserId: 'sub-customer',
  email: 'customer@example.test',
  displayName: 'Customer',
  capabilities: Object.freeze(['CUSTOMER'] as const),
});

const ADMIN: AuthenticatedUser = Object.freeze({
  id: 'local-admin',
  clerkUserId: 'sub-admin',
  email: 'admin@example.test',
  displayName: 'Admin',
  capabilities: Object.freeze(['CUSTOMER', 'ADMIN'] as const),
});

@Controller('capability-probe')
class CapabilityProbeController {
  @Get('admin-data')
  @RequireCapability('ADMIN')
  adminData(@CurrentUser() user: AuthenticatedUser): Record<string, unknown> {
    return { protected: 'admin-only-data', id: user.id };
  }

  @Post('admin-action')
  @RequireCapability('ADMIN')
  adminAction(
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: AuthenticatedUser,
  ): Record<string, unknown> {
    return { protected: 'admin-only-data', id: user.id, body };
  }

  @Get('baseline')
  baseline(): Record<string, unknown> {
    return { ok: true, baseline: true };
  }
}

/**
 * Capability decisions are tested in isolation from Clerk verification: an
 * attach-user guard stands in for the global auth guard and sets ONLY the
 * server-resolved local user. Client-supplied role/user fields are never read.
 */
describe('CapabilityGuard (action-level, local state only)', () => {
  let app: INestApplication;
  let currentUser: AuthenticatedUser | undefined;

  const attachUserGuard: CanActivate = {
    canActivate(context: ExecutionContext): boolean {
      const req = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
      if (currentUser !== undefined) req.user = currentUser;
      return true;
    },
  };

  beforeEach(async () => {
    currentUser = CUSTOMER;
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [CapabilityProbeController],
      providers: [CapabilityGuard, Reflector],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalGuards(attachUserGuard, moduleRef.get(CapabilityGuard));
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('denies a customer request to an admin-only route with 403 and no protected data', async () => {
    currentUser = CUSTOMER;
    const response = await request(app.getHttpServer())
      .get('/capability-probe/admin-data')
      .expect(403);
    expect(JSON.stringify(response.body)).not.toContain('admin-only-data');
    expect(response.body).not.toHaveProperty('id');
  });

  it('allows an admin request to the same route', async () => {
    currentUser = ADMIN;
    const response = await request(app.getHttpServer())
      .get('/capability-probe/admin-data')
      .expect(200);
    expect(response.body).toEqual({ protected: 'admin-only-data', id: 'local-admin' });
  });

  it('never lets client body/query fields supply capability or owner metadata', async () => {
    currentUser = CUSTOMER;
    await request(app.getHttpServer())
      .post('/capability-probe/admin-action')
      .query({ capability: 'ADMIN', role: 'ADMIN', userId: 'local-admin' })
      .send({ capability: 'ADMIN', capabilities: ['ADMIN'], role: 'ADMIN', user: { id: 'attacker' } })
      .expect(403);
  });

  it('denies an unauthenticated request before any capability is granted', async () => {
    currentUser = undefined;
    await request(app.getHttpServer()).get('/capability-probe/admin-data').expect(401);
  });

  it('leaves unannotated baseline routes open to any authenticated local user', async () => {
    currentUser = CUSTOMER;
    const response = await request(app.getHttpServer()).get('/capability-probe/baseline').expect(200);
    expect(response.body).toEqual({ ok: true, baseline: true });
  });
});

describe('hasRequiredCapability (pure local-state policy)', () => {
  it('treats customer as the implicit baseline and checks only persisted capabilities', () => {
    expect(hasRequiredCapability(['CUSTOMER'], 'ADMIN')).toBe(false);
    expect(hasRequiredCapability(['CUSTOMER', 'ADMIN'], 'ADMIN')).toBe(true);
    expect(hasRequiredCapability(['CUSTOMER'], 'MERCHANT')).toBe(false);
    expect(hasRequiredCapability(['CUSTOMER', 'MERCHANT'], 'MERCHANT')).toBe(true);
    expect(hasRequiredCapability(['CUSTOMER', 'MERCHANT'], 'ADMIN')).toBe(false);
  });
});
