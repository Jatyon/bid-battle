import { UnauthorizedException, ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { AppConfigService } from '@config/config.service';
import { User, UsersService, UsersTokenService } from '@modules/users';
import { MailService } from '@modules/mail';
import { createMockI18nContext, createMockI18nService } from '@test/mocks/i18n.mock';
import { createUserFixture } from '@test/fixtures/users.fixtures';
import { AuthRegisterDto, AuthLoginDto, RefreshTokenDto } from './dto';
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
  let authService: AuthService;

  const mockI18nService = createMockI18nService();
  const mockI18nContext = createMockI18nContext();
  const mockUser = createUserFixture();

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
