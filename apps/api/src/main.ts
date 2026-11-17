import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { ApiExceptionFilter, type ExceptionSink } from './common/errors/api-exception.filter';
import { ApiValidationPipe } from './common/validation/validation.pipe';
import { setupOpenApi } from './openapi';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  const pinoLogger = app.get(Logger);
  app.useLogger(pinoLogger);

  // One validation and error boundary for every route, registered before any
  // request can reach a controller (threats T-05-01 and T-05-02).
  app.useGlobalPipes(new ApiValidationPipe());
  const errorSink: ExceptionSink = {
    error(payload: Record<string, unknown>, message: string): void {
      pinoLogger.error(payload, message);
    },
  };
  app.useGlobalFilters(new ApiExceptionFilter(errorSink));

  // The single OpenAPI assembler owns the document; later plans extend it.
  setupOpenApi(app);

  app.enableShutdownHooks();
  await app.listen(3000);
}

void bootstrap();
