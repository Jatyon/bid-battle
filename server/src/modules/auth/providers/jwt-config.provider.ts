import { JwtModuleOptions, JwtOptionsFactory } from '@nestjs/jwt';
import { Injectable } from '@nestjs/common';
import { AppConfigService } from '@config/config.service';

@Injectable()
export class JwtConfigProvider implements JwtOptionsFactory {
  constructor(private readonly configService: AppConfigService) {}

  createJwtOptions(): JwtModuleOptions {
    return {
      secret: this.configService.jwt.secret,
    };
  }
}
