import { BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { createUserFixture } from '@test/fixtures/users.fixtures';
import { createMockI18nContext } from '@test/mocks/i18n.mock';
import { AuthRegisterDto, AuthLoginDto, RefreshTokenDto, ForgotPasswordDto, AuthResetPasswordDto, AuthChangePasswordDto } from './dto';
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

  const mockUser = createUserFixture();

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

  describe('forgotPassword', () => {
    const forgotPasswordDto: ForgotPasswordDto = {
      email: 'test@example.com',
    };

    it('returns success message and calls authService.forgotPassword', async () => {
      authService.forgotPassword.mockResolvedValue(undefined);
      const i18n = createMockI18nContext({
        'auth.info.password_reset_link_sent': 'Password reset link sent',
      });

      const result = await controller.forgotPassword(forgotPasswordDto, i18n);

      expect(authService.forgotPassword).toHaveBeenCalledWith(forgotPasswordDto, i18n);
      expect(result).toEqual({ message: 'Password reset link sent' });
    });
  });

  describe('resetPassword', () => {
    const resetPasswordDto: AuthResetPasswordDto = {
      token: 'some-valid-token',
      password: 'NewPassword123!',
      passwordRepeat: 'NewPassword123!',
    };

    it('returns success message when password is reset successfully', async () => {
      authService.resetPassword.mockResolvedValue(undefined);
      const i18n = createMockI18nContext({
        'auth.info.password_successfully_changed': 'Password successfully changed',
      });

      const result = await controller.resetPassword(resetPasswordDto, i18n);

      expect(authService.resetPassword).toHaveBeenCalledWith(resetPasswordDto, i18n);
      expect(result).toEqual({ message: 'Password successfully changed' });
    });

    it('propagates exception on invalid or expired token', async () => {
      authService.resetPassword.mockRejectedValue(new BadRequestException('Token has expired'));

      await expect(controller.resetPassword(resetPasswordDto, createMockI18nContext())).rejects.toThrow(BadRequestException);
    });
  });

  describe('changePassword', () => {
    const changePasswordDto: AuthChangePasswordDto = {
      currentPassword: 'OldPassword123!',
      password: 'NewPassword123!',
      passwordRepeat: 'NewPassword123!',
    };

    it('returns success message when password is changed successfully', async () => {
      authService.changePassword.mockResolvedValue(undefined);
      const i18n = createMockI18nContext({
        'auth.info.password_successfully_changed': 'Password has been changed successfully',
      });

      const result = await controller.changePassword(mockUser, changePasswordDto, i18n);

      expect(authService.changePassword).toHaveBeenCalledWith(mockUser.email, changePasswordDto, i18n);
      expect(result).toEqual({ message: 'Password has been changed successfully' });
    });

    it('propagates UnauthorizedException if old password does not match', async () => {
      authService.changePassword.mockRejectedValue(new UnauthorizedException('The current password is incorrect'));

      await expect(controller.changePassword(mockUser, changePasswordDto, createMockI18nContext())).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('getMe', () => {
    it('returns the current user from the request', () => {
      const result = controller.getMe(mockUser);

      expect(result).toEqual(mockUser);
    });
  });
});
