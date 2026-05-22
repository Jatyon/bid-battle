import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { AppConfigService } from '@config/config.service';
import { AuthStrategy } from '../enums/auth-strategy.enum';
import { IOAuthProfile } from '../interfaces';
import { Strategy } from 'passport-github2';
import { I18nService } from 'nestjs-i18n';

type DoneCallback = (error: Error | null, user?: IOAuthProfile | false) => void;

export interface GithubProfile {
  id: string | number;
  username?: string;
  displayName?: string;
  emails?: Array<{ value: string; primary?: boolean; verified?: boolean }>;
  photos?: Array<{ value: string }>;
}

@Injectable()
export class GithubOAuthStrategy extends PassportStrategy(Strategy, AuthStrategy.GITHUB) {
  constructor(
    readonly configService: AppConfigService,
    private readonly i18n: I18nService,
  ) {
    super({
      clientID: configService.github.clientId,
      clientSecret: configService.github.clientSecret,
      callbackURL: configService.github.callbackUrl,
      scope: ['user:email'],
      allRawEmails: true,
    });
  }

  validate(accessToken: string, refreshToken: string, profile: GithubProfile, done: DoneCallback): void {
    const { id, emails, displayName, username, photos } = profile;

    const primaryEmail = emails?.find((e) => e.primary && e.verified) ?? emails?.[0];

    if (!primaryEmail || !primaryEmail.verified) throw new UnauthorizedException(this.i18n.t('auth.errors.github_email_not_verified'));

    const rawName = displayName || username || '';
    const nameParts = rawName.trim().split(/\s+/);

    const firstName = nameParts[0] ?? '';
    const lastName = nameParts.slice(1).join(' ') || '';

    const oauthProfile: IOAuthProfile = {
      providerId: String(id),
      email: primaryEmail?.value ?? '',
      emailVerified: true,
      firstName,
      lastName,
      avatar: photos?.[0]?.value ?? null,
    };

    done(null, oauthProfile);
  }
}
