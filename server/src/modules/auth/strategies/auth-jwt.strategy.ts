import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';
import { AppConfigService } from '@config/services/config.service';
import { IAuthJwt } from '../interfaces/auth-jwt.interface';
import { AuthStrategy } from '../enums/auth-strategy.enum';
import { AuthService } from '../services/auth.service';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { I18nService } from 'nestjs-i18n';

@Injectable()
export class AuthJwtStrategy extends PassportStrategy(Strategy, AuthStrategy.JWT) {
  constructor(
    readonly configService: AppConfigService,
    private readonly authService: AuthService,
    private readonly i18n: I18nService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.jwt.secret,
    });
  }

  async validate(payload: IAuthJwt): Promise<any> {
    return await this.authService.validateJwtUser(payload.payload, this.i18n);
  }
}
