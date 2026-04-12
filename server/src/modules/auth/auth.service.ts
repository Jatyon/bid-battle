import { Injectable, Logger, UnauthorizedException, ConflictException, BadRequestException, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AppConfigService } from '@config/config.service';
import { User, UsersService, UserTokenEnum, UsersTokenService, UserToken, UserPreferencesService, SocialAccountService } from '@modules/users';
import { SocialProviderEnum } from '@modules/users/enums';
import { MailService } from '@shared/mail';
import { AuthRegisterDto, AuthLoginDto, RefreshTokenDto, ForgotPasswordDto, AuthChangePasswordDto, AuthResetPasswordDto, VerifyEmailDto, ResendVerificationEmailDto } from './dto';
import { IAuthJwt, IAuthJwtPayload, IGoogleUser } from './interfaces';
import { AuthTokens } from './models';
import { I18nContext, I18nService } from 'nestjs-i18n';
import * as bcrypt from 'bcrypt';
import { StringValue } from 'ms';

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

  async login(authLoginDto: AuthLoginDto, i18n: I18nContext): Promise<AuthTokens> {
    const user = await this.validateUser(authLoginDto.email, authLoginDto.password);

    if (!user) throw new UnauthorizedException(i18n.t('auth.errors.invalid_credential'));

    if (!user.isEmailVerified) throw new UnauthorizedException(i18n.t('auth.errors.email_not_verified'));

    await this.usersService.updateBy(
      { id: user.id },
      {
        lastLoginAt: new Date(),
      },
    );

    return this.generateAuthTokens(user);
  }

  async refreshToken(refreshTokenDto: RefreshTokenDto, i18n: I18nContext): Promise<AuthTokens> {
    let payload: IAuthJwtPayload;

    try {
      payload = await this.jwtService.verifyAsync(refreshTokenDto.refreshToken, {
        secret: this.configService.jwt.refreshSecret,
      });
    } catch {
      throw new UnauthorizedException(i18n.t(`auth.errors.refresh_token_not_recognized`));
    }

    const user = await this.usersService.findOneBy({ email: payload.email, id: payload.sub });

    if (!user) throw new UnauthorizedException(i18n.t('auth.errors.invalid_credential'));

    const storedToken = await this.usersTokenService.findActiveRefreshToken(refreshTokenDto.refreshToken, user.id);

    if (!storedToken) throw new UnauthorizedException(i18n.t('auth.errors.refresh_token_not_recognized'));

    await this.usersTokenService.markTokenAsUsed(storedToken.id);

    return this.generateAuthTokens(user);
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

  private async generateAuthTokens(user: User): Promise<AuthTokens> {
    const payload: IAuthJwtPayload = { sub: user.id, email: user.email };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        expiresIn: this.configService.jwt.tokenLife as StringValue,
      }),
      this.jwtService.signAsync(payload, {
        secret: this.configService.jwt.refreshSecret,
        expiresIn: this.configService.jwt.refreshTokenLife as StringValue,
      }),
    ]);

    await this.usersTokenService.saveRefreshToken(user, refreshToken, this.configService.jwt.refreshTokenLife as StringValue);

    return {
      accessToken,
      refreshToken,
    };
  }

  async loginWithGoogle(googleUser: IGoogleUser): Promise<AuthTokens> {
    let socialAccount = await this.socialAccountService.findByProvider(SocialProviderEnum.GOOGLE, googleUser.providerId);

    if (!socialAccount) {
      let user = await this.usersService.findOneBy({ email: googleUser.email });

      if (!user) {
        const newUser = this.usersService.create({
          email: googleUser.email,
          firstName: googleUser.firstName,
          lastName: googleUser.lastName,
          avatar: googleUser.avatar ?? null,
          isEmailVerified: true,
          password: undefined,
        });

        user = await this.usersService.save(newUser);

        await this.userPreferencesService.createDefaultPreferences(user.id);
      }

      socialAccount = await this.socialAccountService.createForUser(SocialProviderEnum.GOOGLE, googleUser.providerId, user.id);

      socialAccount.user = user;
    }

    await this.usersService.updateBy({ id: socialAccount.userId }, { lastLoginAt: new Date() });

    return this.generateAuthTokens(socialAccount.user);
  }

  private async sendVerificationEmail(user: User, i18n: I18nContext): Promise<void> {
    const verificationToken = await this.usersTokenService.generateToken(user, UserTokenEnum.EMAIL_VERIFICATION, this.configService.app.emailVerificationExpiresInMin);

    await this.mailService.sendEmailVerificationEmail(user.email, i18n.lang, user.concatName, this.configService.app.emailVerificationExpiresInMin, verificationToken.token);
  }
}
