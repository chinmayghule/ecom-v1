import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';
import { LoggingModule } from './common/logging/logging.module';
import { IdentityModule } from './identity/identity.module';
import { AuthModule } from './common/auth/auth.module';

/**
 * Root application module.
 *
 * Logging is global; health transitively provides the single database client.
 * Identity owns local-user provisioning and Auth supplies the global guard
 * registered in main.ts.
 */
@Module({
  imports: [LoggingModule, HealthModule, IdentityModule, AuthModule],
})
export class AppModule {}
