import { Global, Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { pinoHttpOptions } from './pino.config';

/**
 * The single Pino provider for the whole API. The global scope lets any module
 * inject `nestjs-pino`'s `Logger` without re-declaring the transport.
 */
@Global()
@Module({
  imports: [LoggerModule.forRoot({ pinoHttp: pinoHttpOptions })],
})
export class LoggingModule {}
