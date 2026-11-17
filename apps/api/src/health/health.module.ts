import { Module } from '@nestjs/common';
import { PrismaModule } from '../common/database/prisma.module';
import {
  HealthService,
  READINESS_TIMEOUT_MS,
  READINESS_TIMEOUT_TOKEN,
} from './health.service';
import { HealthController } from './health.controller';

/** Wires the single database client into the public liveness/readiness routes. */
@Module({
  imports: [PrismaModule],
  controllers: [HealthController],
  providers: [
    HealthService,
    { provide: READINESS_TIMEOUT_TOKEN, useValue: READINESS_TIMEOUT_MS },
  ],
  exports: [HealthService],
})
export class HealthModule {}
