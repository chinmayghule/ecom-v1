import { Module } from '@nestjs/common';
import { IDENTITY_RESOLVER } from '../common/auth/auth.types';
import { PrismaModule } from '../common/database/prisma.module';
import { AccountLifecycleRepository } from './account-lifecycle.repository';
import { AccountLifecycleService } from './account-lifecycle.service';
import { PROVIDER_REVOCATION } from './account-lifecycle.types';
import { ClerkAccountRevocationService } from './clerk-account-revocation.service';
import { IdentityRepository } from './identity.repository';
import { IdentityService } from './identity.service';

/**
 * Owns local-user provisioning, the application-owned capability state and
 * the owner-approved deletion/closure lifecycle. The resolver token is what
 * the global auth guard consumes; the lifecycle services are exported for the
 * identity controller's self-only deletion endpoint.
 */
@Module({
  imports: [PrismaModule],
  providers: [
    IdentityRepository,
    IdentityService,
    { provide: IDENTITY_RESOLVER, useExisting: IdentityService },
    AccountLifecycleRepository,
    AccountLifecycleService,
    ClerkAccountRevocationService,
    // The lifecycle service orchestrates via the port; the concrete provider
    // revoker is attempted only after the local commit (owner resolution).
    { provide: PROVIDER_REVOCATION, useExisting: ClerkAccountRevocationService },
  ],
  exports: [IdentityService, IDENTITY_RESOLVER, AccountLifecycleService],
})
export class IdentityModule {}
