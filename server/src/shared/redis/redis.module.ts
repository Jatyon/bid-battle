import { Global, Module } from '@nestjs/common';
import { AppConfigService } from '@config/config.service';
import { REDIS_CLIENT } from './redis.constants';
import { RedisService } from './redis.service';
import Redis from 'ioredis';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: (configService: AppConfigService) => {
        return new Redis({
          host: configService.redis.host,
          port: configService.redis.port,
          password: configService.redis.password,
        });
      },
      inject: [AppConfigService],
    },
    RedisService,
  ],
  exports: [REDIS_CLIENT, RedisService],
})
export class RedisModule {}
