import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';
import { LoggingModule } from './common/logging/logging.module';
import { IdentityModule } from './identity/identity.module';

/**
 * Root application module.
 *
 * Logging is global; health transitively provides the single database client.
 * Identity owns local-user provisioning; the global auth guard is attached in
 * Plan 06.
 */
@Module({
  imports: [LoggingModule, HealthModule, IdentityModule],
})
export class AppModule {}
