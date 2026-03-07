import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ApiStandardResponse } from '@core/decorators/api-standard-response.decorator';
import { Public } from '@core/decorators/public.decorator';
import { HealthDto } from './dto';

@ApiTags('Health')
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
