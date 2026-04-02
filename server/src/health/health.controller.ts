import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ApiStandardResponse, Public } from '@core/decorators';
import { HealthDetailDto, HealthDto } from './dto';
import { HealthService } from './health.service';

@ApiTags('Health')
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  /**
   * Liveness probe — is the process alive?
   * No external checks: just proves the HTTP server can respond.
   * Used by Docker / Kubernetes to decide whether to restart the container.
   */
  @ApiOperation({
    summary: 'Liveness probe',
    description: 'Lightweight check — proves the process is running. No external dependency checks.',
  })
  @Get('live')
  @Public()
  @ApiStandardResponse(HealthDto, false)
  live(): HealthDto {
    return { status: 'UP' };
  }

  /**
   * Readiness probe — are all external dependencies reachable?
   * Checks: MySQL, Redis, BullMQ queues.
   * Used by load balancers / orchestrators to decide whether to route traffic here.
   * Returns HTTP 503 when any dependency is DOWN.
   */
  @ApiOperation({
    summary: 'Readiness probe',
    description: 'Checks external dependencies: database, Redis, BullMQ. Returns 503 when any component is DOWN.',
  })
  @Get('ready')
  @Public()
  @ApiStandardResponse(HealthDetailDto, false)
  @ApiResponse({ status: 503, description: 'One or more dependencies are unavailable' })
  async ready(): Promise<HealthDetailDto> {
    const result = await this.healthService.getReadiness();

    if (result.status === 'DOWN') throw new HttpException(result, HttpStatus.SERVICE_UNAVAILABLE);

    return result;
  }
}
