import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { Strategy, VerifyCallback, Profile } from 'passport-google-oauth20';
import { AppConfigService } from '@config/config.service';
import { AuthStrategy } from '../enums/auth-strategy.enum';
import { IOAuthProfile } from '../interfaces';
import { I18nService } from 'nestjs-i18n';

@Injectable()
export class GoogleOAuthStrategy extends PassportStrategy(Strategy, AuthStrategy.GOOGLE) {
  constructor(
    readonly configService: AppConfigService,
    private readonly i18n: I18nService,
  ) {
    super({
      clientID: configService.google.clientId,
      clientSecret: configService.google.clientSecret,
      callbackURL: configService.google.callbackUrl,
      scope: ['email', 'profile'],
    });
  }

  validate(accessToken: string, refreshToken: string, profile: Profile, done: VerifyCallback): void {
    const { id, emails, name, photos } = profile;

    const primaryEmail = emails?.[0];

    if (!primaryEmail || !primaryEmail.verified) throw new UnauthorizedException(this.i18n.t('auth.errors.google_email_not_verified'));

    const user: IOAuthProfile = {
      providerId: id,
      email: primaryEmail.value,
      firstName: name?.givenName ?? '',
      lastName: name?.familyName ?? '',
      emailVerified: true,
      avatar: photos?.[0]?.value ?? null,
    };

    done(null, user);
  }
}
