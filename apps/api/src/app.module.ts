import { Module } from '@nestjs/common';
import { LoggingModule } from './common/logging/logging.module';

/**
 * Root application module.
 *
 * The Pino provider is global so every request and the error sink share one
 * structured logger. Database and health modules are attached by the next task.
 */
@Module({
  imports: [LoggingModule],
})
export class AppModule {}
