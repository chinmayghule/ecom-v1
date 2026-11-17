import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsPublic } from '../common/auth/is-public.decorator';
import { HealthService, type LivenessStatus, type ReadinessStatus } from './health.service';

/**
 * Explicit health routes. Both are public by contract so container orchestrators
 * and local reviewers can probe them without a Clerk session (Plan 06's global
 * guard honours the @IsPublic metadata).
 */
@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get('live')
  @IsPublic()
  @ApiOperation({ summary: 'Process liveness — no dependency call' })
  @ApiOkResponse({ description: 'The process is running.' })
  live(): LivenessStatus {
    return this.healthService.getLiveness();
  }

  @Get('ready')
  @IsPublic()
  @ApiOperation({ summary: 'Dependency readiness — probes PostgreSQL' })
  @ApiOkResponse({ description: 'All required dependencies are reachable.' })
  ready(): Promise<ReadinessStatus> {
    return this.healthService.getReadiness();
  }
}
