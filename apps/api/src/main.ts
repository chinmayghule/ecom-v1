import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { parseWebOrigins } from './common/auth/auth.types';
import { buildCorsOptions } from './common/auth/auth.module';
import { ClerkAuthGuard } from './common/auth/clerk-auth.guard';
import { validateEnv } from './common/config/env.validation';
import { ApiExceptionFilter, type ExceptionSink } from './common/errors/api-exception.filter';
import { ApiValidationPipe } from './common/validation/validation.pipe';
import { setupOpenApi } from './openapi';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  const pinoLogger = app.get(Logger);
  app.useLogger(pinoLogger);

  // Cross-origin browser clients send a Clerk bearer token: allow only the
  // configured web origins, never a wildcard origin with credentials.
  const config = validateEnv();
  app.enableCors(buildCorsOptions(parseWebOrigins(config.clerkWebOrigin)));

  // One validation and error boundary for every route, registered before any
  // request can reach a controller (threats T-05-01 and T-05-02).
  app.useGlobalPipes(new ApiValidationPipe());
  const errorSink: ExceptionSink = {
    error(payload: Record<string, unknown>, message: string): void {
      pinoLogger.error(payload, message);
    },
  };
  app.useGlobalFilters(new ApiExceptionFilter(errorSink));

  // Deny-by-default: only routes explicitly marked @IsPublic() bypass this.
  // Every other route requires a verified Clerk token and a resolved local user.
  app.useGlobalGuards(app.get(ClerkAuthGuard));

  // The single OpenAPI assembler owns the document; later plans extend it.
  setupOpenApi(app);

  app.enableShutdownHooks();
  await app.listen(3000);
}

void bootstrap();
