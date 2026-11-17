import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';
import { LoggingModule } from './common/logging/logging.module';
import { IdentityModule } from './identity/identity.module';
import { IdentityController } from './identity/identity.controller';
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
  // The controller is registered at the root so it consumes the exported
  // IdentityService; it adds no new document source or module to the graph.
  controllers: [IdentityController],
})
export class AppModule {}
