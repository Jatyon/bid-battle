import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { createMockI18nContext } from '@test/mocks/i18n.mock';
import { AuthRegisterDto, AuthLoginDto, RefreshTokenDto } from './dto';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { createMock, DeepMocked } from '@golevelup/ts-jest';

const mockTokens = {
  accessToken: 'access_token',
  refreshToken: 'refresh_token',
};

describe('AuthController', () => {
  let controller: AuthController;
  let authService: DeepMocked<AuthService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: createMock<AuthService>() }],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    authService = module.get(AuthService);
  });

  describe('register', () => {
    const registerDto: AuthRegisterDto = {
      email: 'new@example.com',
      firstName: 'John',
      lastName: 'Doe',
      password: 'Password123!',
      passwordRepeat: 'Password123!',
    } as AuthRegisterDto;

    it('returns success message when registration succeeds', async () => {
      authService.register.mockResolvedValue(undefined);
      const i18n = createMockI18nContext({
        'auth.info.registration_completed_successfully': 'Registration completed successfully',
      });

      const result = await controller.register(registerDto, i18n);

      expect(authService.register).toHaveBeenCalledWith(registerDto, i18n);
      expect(result).toEqual({ message: 'Registration completed successfully' });
    });

    it('propagates ConflictException when email already exists', async () => {
      authService.register.mockRejectedValue(new ConflictException('Email already exists'));

      await expect(controller.register(registerDto, createMockI18nContext())).rejects.toThrow(ConflictException);
    });
  });

  describe('login', () => {
    const loginDto: AuthLoginDto = {
      email: 'test@example.com',
      password: 'Password123!',
    } as AuthLoginDto;

    it('returns auth tokens on valid credentials', async () => {
      authService.login.mockResolvedValue(mockTokens);
      const i18n = createMockI18nContext();

      const result = await controller.login(loginDto, i18n);

      expect(authService.login).toHaveBeenCalledWith(loginDto, i18n);
      expect(result).toEqual(mockTokens);
    });

    it('propagates UnauthorizedException on invalid credentials', async () => {
      authService.login.mockRejectedValue(new UnauthorizedException('Invalid credentials'));

      await expect(controller.login(loginDto, createMockI18nContext())).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('refreshToken', () => {
    const refreshTokenDto: RefreshTokenDto = {
      refreshToken: 'valid_refresh_token',
    } as RefreshTokenDto;

    it('returns new auth tokens for a valid refresh token', async () => {
      authService.refreshToken.mockResolvedValue(mockTokens);
      const i18n = createMockI18nContext();

      const result = await controller.refreshToken(refreshTokenDto, i18n);

      expect(authService.refreshToken).toHaveBeenCalledWith(refreshTokenDto, i18n);
      expect(result).toEqual(mockTokens);
    });

    it('propagates UnauthorizedException when refresh token is invalid', async () => {
      authService.refreshToken.mockRejectedValue(new UnauthorizedException('Token not recognized'));

      await expect(controller.refreshToken(refreshTokenDto, createMockI18nContext())).rejects.toThrow(UnauthorizedException);
    });

    it('propagates UnauthorizedException when user no longer exists', async () => {
      authService.refreshToken.mockRejectedValue(new UnauthorizedException('Invalid credentials'));

      await expect(controller.refreshToken(refreshTokenDto, createMockI18nContext())).rejects.toThrow(UnauthorizedException);
    });
  });
});
