import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';
import { AppConfigService } from '@config/config.service';
import { User } from '@modules/users';
import { IAuthJwt } from '../interfaces/auth-jwt.interface';
import { AuthStrategy } from '../enums/auth-strategy.enum';
import { AuthService } from '../auth.service';
import { ExtractJwt, Strategy } from 'passport-jwt';

@Injectable()
export class AuthJwtStrategy extends PassportStrategy(Strategy, AuthStrategy.JWT) {
  constructor(
    readonly configService: AppConfigService,
    private readonly authService: AuthService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.jwt.secret,
    });
  }

  async validate(payload: IAuthJwt): Promise<User> {
    return await this.authService.validateJwtUser(payload);
  }
}
