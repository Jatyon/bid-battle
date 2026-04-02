import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';
import { Strategy, VerifyCallback, Profile } from 'passport-google-oauth20';
import { AppConfigService } from '@config/config.service';
import { AuthStrategy } from '../enums/auth-strategy.enum';
import { IGoogleUser } from '../interfaces';

@Injectable()
export class GoogleOAuthStrategy extends PassportStrategy(Strategy, AuthStrategy.GOOGLE) {
  constructor(readonly configService: AppConfigService) {
    super({
      clientID: configService.google.clientId,
      clientSecret: configService.google.clientSecret,
      callbackURL: configService.google.callbackUrl,
      scope: ['email', 'profile'],
    });
  }

  validate(accessToken: string, refreshToken: string, profile: Profile, done: VerifyCallback): void {
    const { id, emails, name, photos } = profile;

    const user: IGoogleUser = {
      providerId: id,
      email: emails?.[0]?.value ?? '',
      firstName: name?.givenName ?? '',
      lastName: name?.familyName ?? '',
      avatar: photos?.[0]?.value,
    };

    done(null, user);
  }
}
