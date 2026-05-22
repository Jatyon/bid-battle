import { Injectable, Logger, UnauthorizedException, ConflictException, BadRequestException, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AppConfigService } from '@config/config.service';
import { User, UserTokenEnum, UserToken, UserPreferences, SocialAccount } from '@modules/users';
import { UserPreferencesService } from '@modules/users/user-preferences.service';
import { SocialAccountService } from '@modules/users/social-account.service';
import { UsersTokenService } from '@modules/users/users-token.service';
import { UsersService } from '@modules/users/users.service';
import { SocialProviderEnum } from '@modules/users/enums';
import { RedisService } from '@shared/redis';
import { MailService } from '@shared/mail';
import { AuthRegisterDto, AuthLoginDto, ForgotPasswordDto, AuthChangePasswordDto, AuthResetPasswordDto, VerifyEmailDto, ResendVerificationEmailDto } from './dto';
import { IAuthJwt, IAuthJwtPayload, IOAuthProfile, IOAuthUser } from './interfaces';
import { AuthRefreshResponse, AuthSession, AuthTokens } from './models';
import { I18nContext, I18nService } from 'nestjs-i18n';
import { DataSource } from 'typeorm';
import { randomUUID } from 'crypto';
import * as bcrypt from 'bcrypt';
import { StringValue } from 'ms';

interface OAuthExchangePayload {
  accessToken: string;
  refreshToken: string;
  user: IOAuthUser;
}

const OAUTH_EXCHANGE_TTL_SECONDS = 120;
const OAUTH_EXCHANGE_KEY = (code: string) => `oauth:exchange:${code}`;

@Injectable()
export class AuthService {
  private readonly logger: Logger = new Logger(AuthService.name);

  constructor(
    private readonly usersTokenService: UsersTokenService,
    private readonly userPreferencesService: UserPreferencesService,
    private readonly configService: AppConfigService,
    private readonly usersService: UsersService,
    private readonly mailService: MailService,
    private readonly jwtService: JwtService,
    private readonly socialAccountService: SocialAccountService,
    private readonly dataSource: DataSource,
    private readonly redisService: RedisService,
  ) {}

  async validateJwtUser(payload: IAuthJwt, i18n: I18nService): Promise<User> {
    const user = await this.usersService.findOneBy({ id: payload.sub });

    if (!user) throw new UnauthorizedException(i18n.t('user.error.user_not_found'));

    if (user.passwordChangedAt && payload.iat != null) {
      const passwordChangedAtSeconds = Math.floor(user.passwordChangedAt.getTime() / 1000);

      if (payload.iat < passwordChangedAtSeconds) throw new UnauthorizedException(i18n.t('auth.errors.token_invalidated_password_changed'));
    }

    return user;
  }

  async register(registerDto: AuthRegisterDto, i18n: I18nContext): Promise<void> {
    const { email, password } = registerDto;

    const existingUser = await this.usersService.findOneBy({ email });

    if (existingUser) throw new ConflictException(i18n.t(`auth.errors.user_with_email_#email_exists`, { args: { email } }));

    const salt: string = await bcrypt.genSalt(this.configService.jwt.saltOrRounds);

    const hashedPassword: string = await bcrypt.hash(password, salt);

    const user = this.usersService.create({
      ...registerDto,
      password: hashedPassword,
    });

    const savedUser = await this.usersService.save(user);

    await this.userPreferencesService.createDefaultPreferences(savedUser.id);

    await this.sendVerificationEmail(savedUser, i18n);
  }

  async verifyEmail(verifyEmailDto: VerifyEmailDto, i18n: I18nContext): Promise<void> {
    const tokenEntity = await this.usersTokenService.verifyToken(verifyEmailDto.token, UserTokenEnum.EMAIL_VERIFICATION, i18n);

    const user = tokenEntity.user;

    if (user.isEmailVerified) throw new BadRequestException(i18n.t('auth.errors.email_already_verified'));

    await this.usersService.updateBy({ id: user.id }, { isEmailVerified: true });

    await this.usersTokenService.markTokenAsUsed(tokenEntity.id);
  }

  async resendVerificationEmail(dto: ResendVerificationEmailDto, i18n: I18nContext): Promise<void> {
    const user = await this.usersService.findOneBy({ email: dto.email });

    // For security reasons, silently succeed if email not found
    if (!user) return;

    if (user.isEmailVerified) return;

    await this.usersTokenService.deleteUserTokensByType(user.id, UserTokenEnum.EMAIL_VERIFICATION);

    await this.sendVerificationEmail(user, i18n);
  }

  async login(authLoginDto: AuthLoginDto, i18n: I18nContext): Promise<AuthSession> {
    const user = await this.validateUser(authLoginDto.email, authLoginDto.password);

    if (!user) throw new UnauthorizedException(i18n.t('auth.errors.invalid_credential'));

    if (!user.isEmailVerified) throw new UnauthorizedException(i18n.t('auth.errors.email_not_verified'));

    await this.usersService.updateBy(
      { id: user.id },
      {
        lastLoginAt: new Date(),
      },
    );

    const oAuthUser: IOAuthUser = {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      avatar: user.avatar,
    };

    const tokens = await this.generateAuthTokens(user);
    return { ...tokens, user: oAuthUser };
  }

  async refreshToken(refreshToken: string, i18n: I18nContext): Promise<AuthRefreshResponse> {
    let payload: IAuthJwtPayload;

    try {
      payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: this.configService.jwt.refreshSecret,
      });
    } catch {
      throw new UnauthorizedException(i18n.t(`auth.errors.refresh_token_not_recognized`));
    }

    const user = await this.usersService.findOneBy({ email: payload.email, id: payload.sub });

    if (!user) throw new UnauthorizedException(i18n.t('auth.errors.invalid_credential'));

    const storedToken = await this.usersTokenService.findActiveRefreshToken(refreshToken, user.id);

    if (!storedToken) throw new UnauthorizedException(i18n.t('auth.errors.refresh_token_not_recognized'));

    const accessToken = await this.generateAccessToken(user);
    return { accessToken };
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;

    let payload: IAuthJwtPayload;
    try {
      payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: this.configService.jwt.refreshSecret,
        ignoreExpiration: true,
      });
    } catch {
      return;
    }

    const storedToken = await this.usersTokenService.findActiveRefreshToken(refreshToken, payload.sub);
    if (storedToken) await this.usersTokenService.markTokenAsUsed(storedToken.id);
  }

  async forgotPassword(forgotPasswordDto: ForgotPasswordDto, i18n: I18nContext): Promise<void> {
    const user = await this.usersService.findOneBy({
      email: forgotPasswordDto.email,
    });

    // For security reasons, we do not inform you whether the email exists
    if (!user) return;

    await this.usersTokenService.deleteUserTokensByType(user.id, UserTokenEnum.PASSWORD_RESET);

    const resetToken = await this.usersTokenService.generateToken(user, UserTokenEnum.PASSWORD_RESET, this.configService.app.resetPasswordExpiresInMin);

    await this.mailService.sendForgotPasswordEmail(user.email, i18n.lang, user.concatName, this.configService.app.resetPasswordExpiresInMin, resetToken.token);
  }

  async resetPassword(resetPasswordDto: AuthResetPasswordDto, i18n: I18nContext): Promise<void> {
    const tokenEntity: UserToken = await this.usersTokenService.verifyToken(resetPasswordDto.token, UserTokenEnum.PASSWORD_RESET, i18n);

    const user: User = tokenEntity.user;

    const salt: string = await bcrypt.genSalt(this.configService.jwt.saltOrRounds);
    const hashedPassword: string = await bcrypt.hash(resetPasswordDto.password, salt);

    await this.usersService.updateBy(
      { id: tokenEntity.userId },
      {
        password: hashedPassword,
        passwordChangedAt: new Date(),
      },
    );

    await this.usersTokenService.markTokenAsUsed(tokenEntity.id);

    await this.mailService.sendPasswordChangedEmail(user.email, i18n.lang, user.concatName);
  }

  async changePassword(email: string, changePasswordDto: AuthChangePasswordDto, i18n: I18nContext): Promise<void> {
    if (changePasswordDto.password !== changePasswordDto.passwordRepeat) throw new BadRequestException(i18n.t('error.validation.passwords_do_not_match'));

    const user = await this.usersService.findOneWithPasswordByEmail(email);

    if (!user) throw new NotFoundException(i18n.t('users.user_not_found'));

    if (!user.password) throw new BadRequestException(i18n.t('auth.errors.oauth_account_use_reset_password'));

    if (!changePasswordDto.currentPassword) throw new BadRequestException(i18n.t('error.validation.currentPassword_is_string'));

    const isPasswordValid = await bcrypt.compare(changePasswordDto.currentPassword, user.password);

    if (!isPasswordValid) throw new BadRequestException(i18n.t('auth.errors.the_current_password_incorrect'));

    const salt: string = await bcrypt.genSalt(this.configService.jwt.saltOrRounds);
    const hashedPassword: string = await bcrypt.hash(changePasswordDto.password, salt);

    await this.usersService.updateBy(
      { email },
      {
        password: hashedPassword,
        passwordChangedAt: new Date(),
      },
    );

    await this.usersTokenService.revokeAllRefreshTokens(user.id);
  }

  async validateUser(email: string, password: string): Promise<User | null> {
    const user = await this.usersService.findOneWithPasswordByEmail(email);

    if (user && user.password && (await bcrypt.compare(password, user.password))) return Object.fromEntries(Object.entries(user).filter(([key]) => key !== 'password')) as User;

    return null;
  }

  private async generateAccessToken(user: User): Promise<string> {
    const payload: IAuthJwtPayload = { sub: user.id, email: user.email };
    return this.jwtService.signAsync(payload, {
      expiresIn: this.configService.jwt.tokenLife as StringValue,
    });
  }

  private async generateRefreshToken(user: User): Promise<string> {
    const payload: IAuthJwtPayload = { sub: user.id, email: user.email };
    const refreshToken = await this.jwtService.signAsync(payload, {
      secret: this.configService.jwt.refreshSecret,
      expiresIn: this.configService.jwt.refreshTokenLife as StringValue,
    });
    await this.usersTokenService.saveRefreshToken(user, refreshToken, this.configService.jwt.refreshTokenLife as StringValue);
    return refreshToken;
  }

  private async generateAuthTokens(user: User): Promise<AuthTokens> {
    const [accessToken, refreshToken] = await Promise.all([this.generateAccessToken(user), this.generateRefreshToken(user)]);
    return { accessToken, refreshToken };
  }

  /**
   * CENTRAL IDENTITY ALGORITHM – handles any OAuth provider.
   *
   * Step 1 – Lookup:
   *   Search for a SocialAccount record by (provider, providerId).
   *   If it exists → retrieve the associated User and generate JWT.
   *
   * Step 2 – Account Linking (merging accounts):
   *   If no SocialAccount is found, check if the email already exists in the database.
   *   SECURITY: merge ONLY when `profile.emailVerified === true`.
   *   This prevents account takeover via providers that do not verify emails.
   *
   * Step 3 – Registration:
   *   If the email does not exist → create a new User + SocialAccount.
   */
  async validateOAuthLogin(profile: IOAuthProfile, provider: SocialProviderEnum): Promise<AuthSession> {
    let socialAccount = await this.socialAccountService.findByProvider(provider, profile.providerId);

    if (!socialAccount) {
      let user = await this.usersService.findOneBy({ email: profile.email });

      if (user) {
        if (!profile.emailVerified) {
          throw new UnauthorizedException(`Cannot link account: email '${profile.email}' is not verified by ${provider}.`);
        }

        socialAccount = await this.socialAccountService.createForUser(provider, profile.providerId, user.id);
        socialAccount.user = user;
      } else {
        const newUser = this.usersService.create({
          email: profile.email,
          firstName: profile.firstName,
          lastName: profile.lastName,
          avatar: profile.avatar ?? null,
          isEmailVerified: profile.emailVerified,
          password: undefined,
        });

        socialAccount = await this.dataSource.transaction(async (manager) => {
          user = await manager.save(User, newUser);

          const preferences = manager.create(UserPreferences, { userId: user.id });
          await manager.save(UserPreferences, preferences);

          const newSocialAccount = manager.create(SocialAccount, { provider, providerId: profile.providerId, userId: user.id });
          const savedSocialAccount = await manager.save(SocialAccount, newSocialAccount);

          savedSocialAccount.user = user;

          return savedSocialAccount;
        });
      }
    }

    await this.usersService.updateBy({ id: socialAccount.userId }, { lastLoginAt: new Date() });

    const oAuthUser: IOAuthUser = {
      id: socialAccount.user.id,
      email: socialAccount.user.email,
      firstName: socialAccount.user.firstName,
      lastName: socialAccount.user.lastName,
      avatar: socialAccount.user.avatar,
    };

    const tokens = await this.generateAuthTokens(socialAccount.user);
    return { ...tokens, user: oAuthUser };
  }

  /**
   * Creates a one-time OAuth exchange code stored in Redis (TTL: 120s).
   * The backend passes this code in the URL instead of an explicit access token.
   *
   * @returns UUID of the exchange code
   */
  async createOAuthExchangeCode(payload: OAuthExchangePayload): Promise<string> {
    const code = randomUUID();
    const key = OAUTH_EXCHANGE_KEY(code);
    await this.redisService.setCache(key, payload, OAUTH_EXCHANGE_TTL_SECONDS);
    return code;
  }

  /**
   * One-time exchange of an OAuth code for tokens.
   * After retrieval, the code is immediately deleted from Redis (cannot be reused).
   *
   * @throws UnauthorizedException when the code is invalid or has expired
   */
  async exchangeOAuthCode(code: string, i18n: I18nContext): Promise<OAuthExchangePayload> {
    const key = OAUTH_EXCHANGE_KEY(code);

    const payload = await this.redisService.getCache<OAuthExchangePayload>(key);

    if (!payload) {
      this.logger.warn(`OAuth exchange code not found or expired: key=${key}`);
      throw new UnauthorizedException(i18n.t('auth.errors.oauth_code_invalid_or_expired'));
    }

    await this.redisService.deleteCache(key);

    return payload;
  }

  private async sendVerificationEmail(user: User, i18n: I18nContext): Promise<void> {
    const verificationToken = await this.usersTokenService.generateToken(user, UserTokenEnum.EMAIL_VERIFICATION, this.configService.app.emailVerificationExpiresInMin);

    await this.mailService.sendEmailVerificationEmail(user.email, i18n.lang, user.concatName, this.configService.app.emailVerificationExpiresInMin, verificationToken.token);
  }
}
