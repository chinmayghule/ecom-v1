import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';
import { LoggingModule } from './common/logging/logging.module';

/**
 * Root application module.
 *
 * Logging is global; health transitively provides the single database client.
 * Later Phase 1 plans attach identity modules here.
 */
@Module({
  imports: [LoggingModule, HealthModule],
})
export class AppModule {}
