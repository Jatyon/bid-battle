import { Controller, Get } from '@nestjs/common';
import { ApiStandardResponse } from '@core/decorators/api-standard-response.decorator';
import { Public } from '@core/decorators/public.decorator';
import { HealthDto } from './dto';

@Controller('health')
export class HealthController {
  @Get()
  @Public()
  @ApiStandardResponse(HealthDto, false)
  live(): HealthDto {
    return {
      status: 'UP',
    };
  }
}
