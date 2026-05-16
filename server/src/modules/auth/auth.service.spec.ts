import { UnauthorizedException, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { AppConfigService } from '@config/config.service';
import { User, UserPreferences, UserPreferencesService, UsersService, UsersTokenService, UserTokenEnum, SocialAccountService, SocialAccount } from '@modules/users';
import { SocialProviderEnum } from '@modules/users/enums';
import { MailService } from '@shared/mail';
import { createMockI18nContext, createMockI18nService } from '@test/mocks/i18n.mock';
import { createUserFixture, createUserTokenFixture } from '@test/fixtures/users.fixtures';
import { createJwtPayload } from '@test/fixtures/auth.fixtures';
import { RedisService } from '@shared/redis/redis.service';
import { AuthRegisterDto, AuthLoginDto, ForgotPasswordDto, AuthResetPasswordDto, AuthChangePasswordDto, VerifyEmailDto, ResendVerificationEmailDto } from './dto';
import { IAuthJwt, IOAuthProfile, IOAuthUser } from './interfaces';
import { AuthService } from './auth.service';
import { createMock, DeepMocked } from '@golevelup/ts-jest';
import { DataSource, EntityManager } from 'typeorm';
import * as bcrypt from 'bcrypt';

jest.mock('bcrypt', () => ({
  genSalt: jest.fn(),
  hash: jest.fn(),
  compare: jest.fn(),
}));

describe('AuthService', () => {
  let usersService: DeepMocked<UsersService>;
  let jwtService: DeepMocked<JwtService>;
  let usersTokenService: DeepMocked<UsersTokenService>;
  let userPreferencesService: DeepMocked<UserPreferencesService>;
  let mailService: DeepMocked<MailService>;
  let socialAccountService: DeepMocked<SocialAccountService>;
  let redisService: DeepMocked<RedisService>;
  let dataSource: DeepMocked<DataSource>;
  let authService: AuthService;

  const mockI18nService = createMockI18nService();
  const mockI18nContext = createMockI18nContext();
  const mockUser = createUserFixture({ id: 1, isEmailVerified: true });
  const mockUserToken = createUserTokenFixture({ token: 'secret-reset-token' });
  const mockUserWithoutPassword = createUserFixture({ password: undefined });
  const mockPayload = createJwtPayload();

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersTokenService, useValue: createMock<UsersTokenService>() },
        { provide: UserPreferencesService, useValue: createMock<UserPreferencesService>() },
        { provide: UsersService, useValue: createMock<UsersService>() },
        { provide: MailService, useValue: createMock<MailService>() },
        { provide: JwtService, useValue: createMock<JwtService>() },
        { provide: SocialAccountService, useValue: createMock<SocialAccountService>() },
        {
          provide: AppConfigService,
          useValue: createMock<AppConfigService>({
            app: {
              resetPasswordExpiresInMin: 15,
              emailVerificationExpiresInMin: 60,
            },
            jwt: {
              saltOrRounds: 10,
              tokenLife: '1d',
              refreshTokenLife: '7d',
            },
          }),
        },
        { provide: RedisService, useValue: createMock<RedisService>() },
        { provide: DataSource, useValue: createMock<DataSource>() },
      ],
    }).compile();

    usersService = module.get(UsersService);
    jwtService = module.get(JwtService);
    usersTokenService = module.get(UsersTokenService);
    userPreferencesService = module.get(UserPreferencesService);
    mailService = module.get(MailService);
    socialAccountService = module.get(SocialAccountService);
    redisService = module.get(RedisService);
    dataSource = module.get(DataSource);
    authService = module.get<AuthService>(AuthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('validateJwtUser', () => {
    const currentTime = new Date();
    const currentTimeSeconds = Math.floor(currentTime.getTime() / 1000);

    it('should return user if they exist and password was never changed', async () => {
      const mockPayload = { sub: 1, iat: currentTimeSeconds } as IAuthJwt;
      const userWithoutPasswordChange = createUserFixture({ passwordChangedAt: null });
      usersService.findOneBy.mockResolvedValue(userWithoutPasswordChange);

      const result = await authService.validateJwtUser(mockPayload, mockI18nService);

      expect(usersService.findOneBy).toHaveBeenCalledWith({ id: mockPayload.sub });
      expect(result).toEqual(userWithoutPasswordChange);
    });

    it('should throw UnauthorizedException if user is not found', async () => {
      const mockPayload = { sub: 1 } as IAuthJwt;
      usersService.findOneBy.mockResolvedValue(null);

      await expect(authService.validateJwtUser(mockPayload, mockI18nService)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException if token was issued BEFORE password was changed', async () => {
      const mockPayloadOld = { sub: 1, iat: currentTimeSeconds - 3600 } as IAuthJwt;
      const userWithRecentPasswordChange = createUserFixture({ passwordChangedAt: new Date(currentTime.getTime() - 1800 * 1000) });
      usersService.findOneBy.mockResolvedValue(userWithRecentPasswordChange);

      await expect(authService.validateJwtUser(mockPayloadOld, mockI18nService)).rejects.toThrow(UnauthorizedException);
    });

    it('should return user if token was issued AFTER password was changed', async () => {
      const mockPayloadNew = { sub: 1, iat: currentTimeSeconds } as IAuthJwt;
      const userWithOldPasswordChange = createUserFixture({ passwordChangedAt: new Date(currentTime.getTime() - 3600 * 1000) });
      usersService.findOneBy.mockResolvedValue(userWithOldPasswordChange);

      const result = await authService.validateJwtUser(mockPayloadNew, mockI18nService);

      expect(result).toEqual(userWithOldPasswordChange);
    });
  });

  describe('register', () => {
    const registerDto: AuthRegisterDto = {
      firstName: 'John',
      lastName: 'Doe',
      email: 'test@example.com',
      password: 'Password123!',
      passwordRepeat: 'Password123!',
    };

    it('should throw ConflictException if email is already taken', async () => {
      usersService.findOneBy.mockResolvedValue(mockUser);

      await expect(authService.register(registerDto, mockI18nContext)).rejects.toThrow(ConflictException);
    });

    it('should correctly hash password, save user, create preferences and send email', async () => {
      usersService.findOneBy.mockResolvedValue(null);
      (bcrypt.genSalt as jest.Mock).mockResolvedValue('random_salt');
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed_password');
      usersService.create.mockReturnValue(mockUser);
      usersService.save.mockResolvedValue(mockUser);

      userPreferencesService.createDefaultPreferences.mockResolvedValue({} as UserPreferences);

      usersTokenService.generateToken.mockResolvedValue(createUserTokenFixture({ type: UserTokenEnum.EMAIL_VERIFICATION, token: 'verification-token' }));
      mailService.sendEmailVerificationEmail.mockResolvedValue();

      await authService.register(registerDto, mockI18nContext);

      expect(bcrypt.genSalt).toHaveBeenCalledWith(10);
      expect(bcrypt.hash).toHaveBeenCalledWith(registerDto.password, 'random_salt');
      expect(usersService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          ...registerDto,
          password: 'hashed_password',
        }),
      );
      expect(usersService.save).toHaveBeenCalledWith(mockUser);
      expect(userPreferencesService.createDefaultPreferences).toHaveBeenCalledWith(mockUser.id);
      expect(usersTokenService.generateToken).toHaveBeenCalledWith(mockUser, UserTokenEnum.EMAIL_VERIFICATION, 60);
      expect(mailService.sendEmailVerificationEmail).toHaveBeenCalledWith(mockUser.email, mockI18nContext.lang, mockUser.concatName, 60, 'verification-token');
    });
  });

  describe('login', () => {
    const loginDto: AuthLoginDto = {
      email: 'test@example.com',
      password: 'Password123!',
    };

    it('should throw UnauthorizedException if credentials are invalid', async () => {
      usersService.findOneWithPasswordByEmail.mockResolvedValue(null);

      await expect(authService.login(loginDto, mockI18nContext)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException if email is not verified', async () => {
      const unverifiedUser = createUserFixture({ isEmailVerified: false });
      usersService.findOneWithPasswordByEmail.mockResolvedValue(unverifiedUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await expect(authService.login(loginDto, mockI18nContext)).rejects.toThrow(UnauthorizedException);
    });

    it('should update lastLoginAt and return tokens for valid credentials', async () => {
      usersService.findOneWithPasswordByEmail.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      jwtService.signAsync.mockResolvedValueOnce('access_token').mockResolvedValueOnce('refresh_token');

      const result = await authService.login(loginDto, mockI18nContext);

      expect(usersService.updateBy).toHaveBeenCalledWith({ id: mockUser.id }, { lastLoginAt: expect.any(Date) as unknown });
      expect(result).toEqual({ accessToken: 'access_token', refreshToken: 'refresh_token', user: expect.any(Object) as unknown });
    });
  });

  describe('refreshToken', () => {
    const validRefreshToken = 'valid_refresh_token';

    it('should throw UnauthorizedException when JWT verification fails', async () => {
      jwtService.verifyAsync.mockRejectedValue(new Error('Invalid signature'));

      await expect(authService.refreshToken(validRefreshToken, mockI18nContext)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when user does not exist', async () => {
      jwtService.verifyAsync.mockResolvedValue(mockPayload);
      usersService.findOneBy.mockResolvedValue(null);

      await expect(authService.refreshToken(validRefreshToken, mockI18nContext)).rejects.toThrow(UnauthorizedException);
    });

    it('should generate NEW access token for valid refresh token', async () => {
      const storedToken = createUserTokenFixture({ type: UserTokenEnum.REFRESH_TOKEN });
      jwtService.verifyAsync.mockResolvedValue(mockPayload);
      usersService.findOneBy.mockResolvedValue(mockUser);
      usersTokenService.findActiveRefreshToken.mockResolvedValue(storedToken);

      jwtService.signAsync.mockResolvedValueOnce('new_access_token');

      const result = await authService.refreshToken(validRefreshToken, mockI18nContext);

      expect(usersTokenService.findActiveRefreshToken).toHaveBeenCalledWith(validRefreshToken, mockUser.id);
      expect(result).toEqual({
        accessToken: 'new_access_token',
      });
    });

    it('should throw UnauthorizedException when stored refresh token is not found', async () => {
      jwtService.verifyAsync.mockResolvedValue(mockPayload);
      usersService.findOneBy.mockResolvedValue(mockUser);
      usersTokenService.findActiveRefreshToken.mockResolvedValue(null);

      await expect(authService.refreshToken(validRefreshToken, mockI18nContext)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('forgotPassword', () => {
    const dto: ForgotPasswordDto = { email: 'test@example.com' };

    it('should silently return if user is not found to prevent email enumeration', async () => {
      usersService.findOneBy.mockResolvedValue(null);

      await authService.forgotPassword(dto, mockI18nContext);

      expect(usersTokenService.deleteUserTokensByType).not.toHaveBeenCalled();
      expect(mailService.sendForgotPasswordEmail).not.toHaveBeenCalled();
    });

    it('should generate token and send email if user exists', async () => {
      usersService.findOneBy.mockResolvedValue(mockUser);
      usersTokenService.generateToken.mockResolvedValue(mockUserToken);

      await authService.forgotPassword(dto, mockI18nContext);

      expect(usersTokenService.deleteUserTokensByType).toHaveBeenCalledWith(mockUser.id, UserTokenEnum.PASSWORD_RESET);
      expect(usersTokenService.generateToken).toHaveBeenCalledWith(mockUser, UserTokenEnum.PASSWORD_RESET, 15);
      expect(mailService.sendForgotPasswordEmail).toHaveBeenCalledWith(mockUser.email, mockI18nContext.lang, mockUser.concatName, 15, 'secret-reset-token');
    });
  });

  describe('resetPassword', () => {
    const dto: AuthResetPasswordDto = { token: 'valid-token', password: 'NewPassword123!', passwordRepeat: 'NewPassword123!' };

    it('should hash new password, update user, mark token as used and send email', async () => {
      usersTokenService.verifyToken.mockResolvedValue(mockUserToken);
      (bcrypt.genSalt as jest.Mock).mockResolvedValue('random_salt');
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed_new_password');

      await authService.resetPassword(dto, mockI18nContext);

      expect(usersTokenService.verifyToken).toHaveBeenCalledWith(dto.token, UserTokenEnum.PASSWORD_RESET, mockI18nContext);
      expect(bcrypt.genSalt).toHaveBeenCalledWith(10);
      expect(bcrypt.hash).toHaveBeenCalledWith(dto.password, 'random_salt');
      expect(usersService.updateBy).toHaveBeenCalledWith({ id: mockUserToken.userId }, { password: 'hashed_new_password', passwordChangedAt: expect.any(Date) as unknown });
      expect(usersTokenService.markTokenAsUsed).toHaveBeenCalledWith(mockUserToken.id);
      expect(mailService.sendPasswordChangedEmail).toHaveBeenCalledWith(mockUserToken.user.email, mockI18nContext.lang, mockUserToken.user.concatName);
    });
  });

  describe('changePassword', () => {
    const dto: AuthChangePasswordDto = { currentPassword: 'OldPassword123!', password: 'NewPassword123!', passwordRepeat: 'NewPassword123!' };

    it('should throw NotFoundException if user is not found', async () => {
      usersService.findOneWithPasswordByEmail.mockResolvedValue(null);

      await expect(authService.changePassword('test@example.com', dto, mockI18nContext)).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if user has password but did not provide currentPassword', async () => {
      usersService.findOneWithPasswordByEmail.mockResolvedValue(mockUser);

      const missingCurrentPassDto = { password: 'NewPassword123!', passwordRepeat: 'NewPassword123!' } as AuthChangePasswordDto;

      await expect(authService.changePassword('test@example.com', missingCurrentPassDto, mockI18nContext)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if currentPassword does not match', async () => {
      usersService.findOneWithPasswordByEmail.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(authService.changePassword('test@example.com', dto, mockI18nContext)).rejects.toThrow(BadRequestException);
    });

    it('should successfully update password if currentPassword matches', async () => {
      const userWithPass = { ...mockUser, password: 'existing_hashed_password' } as User;

      usersService.findOneWithPasswordByEmail.mockResolvedValue(userWithPass);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (bcrypt.genSalt as jest.Mock).mockResolvedValue('random_salt');
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed_new_password');

      await authService.changePassword('test@example.com', dto, mockI18nContext);

      expect(bcrypt.compare).toHaveBeenCalledWith(dto.currentPassword, userWithPass.password);
      expect(usersService.updateBy).toHaveBeenCalledWith({ email: 'test@example.com' }, { password: 'hashed_new_password', passwordChangedAt: expect.any(Date) as unknown });
    });

    it('should throw BadRequestException if user has NO password (e.g. Google login)', async () => {
      usersService.findOneWithPasswordByEmail.mockResolvedValue(mockUserWithoutPassword);

      const changeDto = {
        password: 'NewPassword123!',
        passwordRepeat: 'NewPassword123!',
      } as AuthChangePasswordDto;

      await expect(authService.changePassword('test@example.com', changeDto, mockI18nContext)).rejects.toThrow(BadRequestException);

      expect(bcrypt.hash).not.toHaveBeenCalled();
      expect(usersService.updateBy).not.toHaveBeenCalled();
      expect(usersTokenService.revokeAllRefreshTokens).not.toHaveBeenCalled();
    });
  });

  describe('verifyEmail', () => {
    const dto: VerifyEmailDto = { token: 'valid-verification-token' };

    it('should verify email, mark token as used and update user', async () => {
      const verificationToken = createUserTokenFixture({
        type: UserTokenEnum.EMAIL_VERIFICATION,
        user: createUserFixture({ isEmailVerified: false }),
      });
      usersTokenService.verifyToken.mockResolvedValue(verificationToken);

      await authService.verifyEmail(dto, mockI18nContext);

      expect(usersTokenService.verifyToken).toHaveBeenCalledWith(dto.token, UserTokenEnum.EMAIL_VERIFICATION, mockI18nContext);
      expect(usersService.updateBy).toHaveBeenCalledWith({ id: verificationToken.user.id }, { isEmailVerified: true });
      expect(usersTokenService.markTokenAsUsed).toHaveBeenCalledWith(verificationToken.id);
    });

    it('should throw BadRequestException if email is already verified', async () => {
      const alreadyVerifiedToken = createUserTokenFixture({
        type: UserTokenEnum.EMAIL_VERIFICATION,
        user: createUserFixture({ isEmailVerified: true }),
      });
      usersTokenService.verifyToken.mockResolvedValue(alreadyVerifiedToken);

      await expect(authService.verifyEmail(dto, mockI18nContext)).rejects.toThrow(BadRequestException);
    });
  });

  describe('resendVerificationEmail', () => {
    const dto: ResendVerificationEmailDto = { email: 'test@example.com' };

    it('should silently return if user is not found', async () => {
      usersService.findOneBy.mockResolvedValue(null);

      await authService.resendVerificationEmail(dto, mockI18nContext);

      expect(usersTokenService.deleteUserTokensByType).not.toHaveBeenCalled();
      expect(mailService.sendEmailVerificationEmail).not.toHaveBeenCalled();
    });

    it('should silently return if email is already verified', async () => {
      usersService.findOneBy.mockResolvedValue(createUserFixture({ isEmailVerified: true }));

      await authService.resendVerificationEmail(dto, mockI18nContext);

      expect(usersTokenService.deleteUserTokensByType).not.toHaveBeenCalled();
      expect(mailService.sendEmailVerificationEmail).not.toHaveBeenCalled();
    });

    it('should delete old tokens and send verification email if user exists and is not verified', async () => {
      const unverifiedUser = createUserFixture({ isEmailVerified: false });
      const verificationToken = createUserTokenFixture({ type: UserTokenEnum.EMAIL_VERIFICATION, token: 'new-verification-token' });
      usersService.findOneBy.mockResolvedValue(unverifiedUser);
      usersTokenService.generateToken.mockResolvedValue(verificationToken);

      await authService.resendVerificationEmail(dto, mockI18nContext);

      expect(usersTokenService.deleteUserTokensByType).toHaveBeenCalledWith(unverifiedUser.id, UserTokenEnum.EMAIL_VERIFICATION);
      expect(usersTokenService.generateToken).toHaveBeenCalledWith(unverifiedUser, UserTokenEnum.EMAIL_VERIFICATION, 60);
      expect(mailService.sendEmailVerificationEmail).toHaveBeenCalledWith(unverifiedUser.email, mockI18nContext.lang, unverifiedUser.concatName, 60, 'new-verification-token');
    });
  });

  describe('validateUser', () => {
    it('should return null if user not found', async () => {
      usersService.findOneWithPasswordByEmail.mockResolvedValue(null);

      const result = await authService.validateUser('test@example.com', 'pass');

      expect(result).toBeNull();
    });

    it('should return null if passwords do not match', async () => {
      usersService.findOneWithPasswordByEmail.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      const result = await authService.validateUser('test@example.com', 'wrong_pass');

      expect(result).toBeNull();
    });

    it('should return user without password if credentials are valid', async () => {
      usersService.findOneWithPasswordByEmail.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await authService.validateUser('test@example.com', 'Password123!');

      const userWithoutPassword = Object.fromEntries(Object.entries(mockUser).filter(([key]) => key !== 'password')) as User;

      expect(result).toEqual(userWithoutPassword);
      expect(result).not.toHaveProperty('password');
    });
  });

  describe('validateOAuthLogin', () => {
    const provider = SocialProviderEnum.GOOGLE;
    const profile: IOAuthProfile = {
      providerId: 'google-12345',
      email: 'oauth@example.com',
      firstName: 'OAuth',
      lastName: 'User',
      avatar: 'http://example.com/avatar.jpg',
      emailVerified: true,
    };

    const mockSocialAccount = {
      id: 1,
      provider,
      providerId: profile.providerId,
      userId: mockUser.id,
      user: mockUser,
    } as SocialAccount;

    it('Step 1: should login using an already linked social account', async () => {
      socialAccountService.findByProvider.mockResolvedValue(mockSocialAccount);
      jwtService.signAsync.mockResolvedValueOnce('access').mockResolvedValueOnce('refresh');

      const result = await authService.validateOAuthLogin(profile, provider);

      expect(socialAccountService.findByProvider).toHaveBeenCalledWith(provider, profile.providerId);
      expect(usersService.updateBy).toHaveBeenCalledWith({ id: mockSocialAccount.userId }, { lastLoginAt: expect.any(Date) as unknown });
      expect(result.user.email).toBe(mockUser.email);
      expect(result.accessToken).toBe('access');
    });

    it('Step 2: should throw UnauthorizedException if trying to link existing user but email is NOT verified by provider', async () => {
      socialAccountService.findByProvider.mockResolvedValue(null);
      usersService.findOneBy.mockResolvedValue(mockUser);

      const unverifiedProfile = { ...profile, emailVerified: false };

      await expect(authService.validateOAuthLogin(unverifiedProfile, provider)).rejects.toThrow(UnauthorizedException);
    });

    it('Step 2: should link an existing user to a new social account if email is verified', async () => {
      socialAccountService.findByProvider.mockResolvedValue(null);
      usersService.findOneBy.mockResolvedValue(mockUser);

      const newlyLinkedAccount = { ...mockSocialAccount, user: undefined } as unknown as SocialAccount;
      socialAccountService.createForUser.mockResolvedValue(newlyLinkedAccount);
      jwtService.signAsync.mockResolvedValueOnce('access').mockResolvedValueOnce('refresh');

      const result = await authService.validateOAuthLogin(profile, provider);

      expect(socialAccountService.createForUser).toHaveBeenCalledWith(provider, profile.providerId, mockUser.id);
      expect(result.user.email).toBe(mockUser.email);
    });

    it('Step 3: should create a new user, preferences, and social account via transaction if user does not exist', async () => {
      socialAccountService.findByProvider.mockResolvedValue(null);
      usersService.findOneBy.mockResolvedValue(null);

      const newUserEntity = { id: 99, email: profile.email } as User;
      usersService.create.mockReturnValue(newUserEntity);

      const mockManager = {
        create: jest.fn().mockImplementation(<T>(entityType: unknown, data: T): T => data),
        save: jest.fn().mockImplementation(<T>(entityType: unknown, data: T): T & { id: number } => {
          if (entityType === User) return { ...data, id: 99 };
          return { ...data, id: 100 };
        }),
      } as unknown as EntityManager;

      (dataSource.transaction as jest.Mock).mockImplementation(async (cb: (em: typeof mockManager) => Promise<unknown>) => cb(mockManager));

      jwtService.signAsync.mockResolvedValueOnce('access').mockResolvedValueOnce('refresh');

      const result = await authService.validateOAuthLogin(profile, provider);

      expect(dataSource.transaction).toHaveBeenCalled();

      expect(mockManager.save).toHaveBeenCalledWith(User, newUserEntity);
      expect(mockManager.save).toHaveBeenCalledWith(UserPreferences, expect.objectContaining({ userId: 99 }));
      expect(mockManager.save).toHaveBeenCalledWith(SocialAccount, expect.objectContaining({ provider, providerId: profile.providerId, userId: 99 }));

      expect(result.user.email).toBe(profile.email);
    });
  });

  describe('OAuth Code Exchange Features', () => {
    const mockExchangePayload = {
      accessToken: 'access',
      refreshToken: 'refresh',
      user: {
        id: 1,
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        avatar: null,
      } as IOAuthUser,
    };
    const validCode = 'valid-code-123';

    describe('createOAuthExchangeCode', () => {
      it('should generate a code, save payload to redis with TTL and return the code', async () => {
        const code = await authService.createOAuthExchangeCode(mockExchangePayload);

        expect(code).toBeDefined();
        expect(typeof code).toBe('string');
        expect(redisService.setCache).toHaveBeenCalledWith(`oauth:exchange:${code}`, mockExchangePayload, 120);
      });
    });

    describe('exchangeOAuthCode', () => {
      it('should throw UnauthorizedException if code is invalid or expired (redis returns null)', async () => {
        redisService.getCache.mockResolvedValue(null);

        await expect(authService.exchangeOAuthCode('invalid-code', mockI18nContext)).rejects.toThrow(UnauthorizedException);
      });

      it('should return the payload and delete the cache if code is valid', async () => {
        redisService.getCache.mockResolvedValue(mockExchangePayload);

        const result = await authService.exchangeOAuthCode(validCode, mockI18nContext);

        expect(result).toEqual(mockExchangePayload);
        expect(redisService.deleteCache).toHaveBeenCalledWith(`oauth:exchange:${validCode}`);
      });
    });
  });
});
