import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ApiStandardResponse, Public } from '@core/decorators';
import { HealthDto } from './dto';

@ApiTags('Health')
@SkipThrottle()
@Controller('health')
export class HealthController {
  @ApiOperation({
    summary: 'Health check',
    description: 'Check if the server is running and healthy',
  })
  @Get()
  @Public()
  @ApiStandardResponse(HealthDto, false)
  live(): HealthDto {
    return {
      status: 'UP',
    };
  }
}
