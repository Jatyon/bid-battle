import { DynamicModule, Module } from '@nestjs/common';
import { AppConfigService } from './services/config.service';

@Module({})
export class AppConfigModule {
  static forRoot(): DynamicModule {
    return {
      module: AppConfigModule,
      global: true,
      providers: [AppConfigService],
      exports: [AppConfigService],
    };
  }
}
