import { Controller, Get } from '@nestjs/common';
import { Public } from '@core/decorators/public.decorator';

@Controller('health')
export class HealthController {
  @Get()
  @Public()
  live() {
    return {
      status: 'UP',
    };
  }
}
