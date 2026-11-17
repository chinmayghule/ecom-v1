import { Module } from '@nestjs/common';
import { IDENTITY_RESOLVER } from '../common/auth/auth.types';
import { PrismaModule } from '../common/database/prisma.module';
import { IdentityRepository } from './identity.repository';
import { IdentityService } from './identity.service';

/**
 * Owns local-user provisioning and the application-owned capability state.
 * The resolver token is what the global auth guard consumes; the concrete
 * service is also exported for explicit administrative use by later plans.
 */
@Module({
  imports: [PrismaModule],
  providers: [
    IdentityRepository,
    IdentityService,
    { provide: IDENTITY_RESOLVER, useExisting: IdentityService },
  ],
  exports: [IdentityService, IDENTITY_RESOLVER],
})
export class IdentityModule {}
