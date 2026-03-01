import { UnauthorizedException, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { AppConfigService } from '@config/config.service';
import { User, UsersService, UsersTokenService, UserTokenEnum } from '@modules/users';
import { MailService } from '@modules/mail';
import { createMockI18nContext, createMockI18nService } from '@test/mocks/i18n.mock';
import { createUserFixture, createUserTokenFixture } from '@test/fixtures/users.fixtures';
import { AuthRegisterDto, AuthLoginDto, RefreshTokenDto, ForgotPasswordDto, AuthResetPasswordDto, AuthChangePasswordDto } from './dto';
import { AuthService } from './auth.service';
import { createMock, DeepMocked } from '@golevelup/ts-jest';
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
  let mailService: DeepMocked<MailService>;
  let authService: AuthService;

  const mockI18nService = createMockI18nService();
  const mockI18nContext = createMockI18nContext();
  const mockUser = createUserFixture();
  const mockUserToken = createUserTokenFixture();
  const mockUserWithoutPassword = createUserFixture({ password: undefined });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersTokenService, useValue: createMock<UsersTokenService>() },
        { provide: UsersService, useValue: createMock<UsersService>() },
        { provide: MailService, useValue: createMock<MailService>() },
        { provide: JwtService, useValue: createMock<JwtService>() },
        {
          provide: AppConfigService,
          useValue: createMock<AppConfigService>({
            app: {
              resetPasswordExpiresInMin: 15,
            },
            jwt: {
              saltOrRounds: 10,
              tokenLife: 3600,
              refreshTokenLife: 7 * 24 * 3600,
            },
          }),
        },
      ],
    }).compile();

    usersService = module.get(UsersService);
    jwtService = module.get(JwtService);
    usersTokenService = module.get(UsersTokenService);
    mailService = module.get(MailService);
    authService = module.get<AuthService>(AuthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('validateJwtUser', () => {
    const payload = { sub: 1, email: 'test@example.com' };

    it('should return user if they exist', async () => {
      usersService.findOneBy.mockResolvedValue(mockUser);

      const result = await authService.validateJwtUser(payload, mockI18nService);

      expect(usersService.findOneBy).toHaveBeenCalledWith({ id: payload.sub });
      expect(result).toEqual(mockUser);
    });

    it('should throw UnauthorizedException if user is not found', async () => {
      usersService.findOneBy.mockResolvedValue(null);

      await expect(authService.validateJwtUser(payload, mockI18nService)).rejects.toThrow(UnauthorizedException);
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

    it('should correctly hash password and save user', async () => {
      usersService.findOneBy.mockResolvedValue(null);
      (bcrypt.genSalt as jest.Mock).mockResolvedValue('random_salt');
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed_password');
      usersService.create.mockReturnValue(mockUser);

      await authService.register(registerDto, mockI18nContext);

      expect(bcrypt.genSalt).toHaveBeenCalledWith(10);
      expect(bcrypt.hash).toHaveBeenCalledWith(registerDto.password, 'random_salt');
      expect(usersService.save).toHaveBeenCalledWith(mockUser);
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

    it('should update lastLoginAt and return tokens for valid credentials', async () => {
      usersService.findOneWithPasswordByEmail.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      jwtService.signAsync.mockResolvedValueOnce('access_token').mockResolvedValueOnce('refresh_token');

      const result = await authService.login(loginDto, mockI18nContext);

      expect(usersService.updateBy).toHaveBeenCalledWith({ id: mockUser.id }, { lastLoginAt: expect.any(Date) as unknown });
      expect(result).toEqual({ accessToken: 'access_token', refreshToken: 'refresh_token' });
    });
  });

  describe('refreshToken', () => {
    const refreshDto: RefreshTokenDto = { refreshToken: 'valid_refresh_token' };
    const jwtPayload = { sub: 1, email: 'test@example.com' };

    it('should throw UnauthorizedException when JWT verification fails', async () => {
      jwtService.verifyAsync.mockRejectedValue(new Error('Invalid signature'));

      await expect(authService.refreshToken(refreshDto, mockI18nContext)).rejects.toThrow(UnauthorizedException);
    });

    it('pshould throw UnauthorizedException when user exist', async () => {
      jwtService.verifyAsync.mockResolvedValue(jwtPayload);
      usersService.findOneBy.mockResolvedValue(null);

      await expect(authService.refreshToken(refreshDto, mockI18nContext)).rejects.toThrow(UnauthorizedException);
    });

    it('should generate new token pair for valid refresh token', async () => {
      jwtService.verifyAsync.mockResolvedValue(jwtPayload);
      usersService.findOneBy.mockResolvedValue(mockUser);
      jwtService.signAsync.mockResolvedValueOnce('new_access_token').mockResolvedValueOnce('new_refresh_token');

      const result = await authService.refreshToken(refreshDto, mockI18nContext);

      expect(result).toEqual({
        accessToken: 'new_access_token',
        refreshToken: 'new_refresh_token',
      });
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
      expect(usersService.updateBy).toHaveBeenCalledWith({ id: mockUserToken.userId }, { password: 'hashed_new_password' });
      expect(usersTokenService.markTokenAsUsed).toHaveBeenCalledWith(mockUserToken.id);
      expect(mailService.sendPasswordChangedEmail).toHaveBeenCalledWith(mockUser.email, mockI18nContext.lang, mockUser.concatName);
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

      const missingCurrentPassDto = { password: 'NewPassword123!', passwordRepeat: 'NewPassword123!' };

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
      expect(usersService.updateBy).toHaveBeenCalledWith({ email: 'test@example.com' }, { password: 'hashed_new_password' });
    });

    it('should allow setting a password without currentPassword if user has NO password (e.g. Google login)', async () => {
      usersService.findOneWithPasswordByEmail.mockResolvedValue(mockUserWithoutPassword);
      (bcrypt.genSalt as jest.Mock).mockResolvedValue('random_salt');
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed_new_password');

      const noCurrentPassDto = { password: 'NewPassword123!', passwordRepeat: 'NewPassword123!' } as AuthChangePasswordDto;

      await authService.changePassword('test@example.com', noCurrentPassDto, mockI18nContext);

      expect(bcrypt.compare).not.toHaveBeenCalled();
      expect(usersService.updateBy).toHaveBeenCalledWith({ email: 'test@example.com' }, { password: 'hashed_new_password' });
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
});
