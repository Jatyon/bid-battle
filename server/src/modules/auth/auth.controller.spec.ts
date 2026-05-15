import { BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { createUserFixture } from '@test/fixtures/users.fixtures';
import { createMockI18nContext } from '@test/mocks/i18n.mock';
import { AuthRegisterDto, AuthLoginDto, ForgotPasswordDto, AuthResetPasswordDto, AuthChangePasswordDto, VerifyEmailDto, ResendVerificationEmailDto } from './dto';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { CookieService } from '@shared/cookies';
import { IGoogleUser } from './interfaces';
import { createMock, DeepMocked } from '@golevelup/ts-jest';
import * as express from 'express';

const mockTokens = {
  accessToken: 'access_token',
  refreshToken: 'refresh_token',
};

describe('AuthController', () => {
  let controller: AuthController;
  let authService: DeepMocked<AuthService>;
  let cookieService: DeepMocked<CookieService>;

  const mockUser = createUserFixture();

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: createMock<AuthService>() },
        { provide: CookieService, useValue: createMock<CookieService>() },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    authService = module.get(AuthService);
    cookieService = module.get(CookieService);
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

    it('sets refresh token in cookie and returns access token on valid credentials', async () => {
      authService.login.mockResolvedValue(mockTokens);
      const i18n = createMockI18nContext();
      const mockRes = createMock<express.Response>();

      const result = await controller.login(loginDto, mockRes, i18n);

      expect(authService.login).toHaveBeenCalledWith(loginDto, i18n);
      expect(cookieService.setRefreshToken).toHaveBeenCalledWith(mockRes, mockTokens.refreshToken);

      expect(result).toEqual({ accessToken: mockTokens.accessToken });
    });

    it('propagates UnauthorizedException on invalid credentials', async () => {
      authService.login.mockRejectedValue(new UnauthorizedException('Invalid credentials'));
      const mockRes = createMock<express.Response>();

      await expect(controller.login(loginDto, mockRes, createMockI18nContext())).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('refreshToken', () => {
    const validToken = 'valid_refresh_token';

    it('returns new auth tokens for a valid refresh token', async () => {
      authService.refreshToken.mockResolvedValue(mockTokens);
      const i18n = createMockI18nContext();

      const result = await controller.refreshToken(validToken, i18n);

      expect(authService.refreshToken).toHaveBeenCalledWith(validToken, i18n);
      expect(result).toEqual(mockTokens);
    });

    it('throws UnauthorizedException when refresh token is missing in cookie', async () => {
      const i18n = createMockI18nContext({
        'auth.errors.refresh_token_not_recognized': 'Refresh token not recognized',
      });

      await expect(controller.refreshToken('', i18n)).rejects.toThrow(UnauthorizedException);
    });

    it('propagates UnauthorizedException when refresh token is invalid', async () => {
      authService.refreshToken.mockRejectedValue(new UnauthorizedException('Token not recognized'));

      await expect(controller.refreshToken(validToken, createMockI18nContext())).rejects.toThrow(UnauthorizedException);
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

  describe('verifyEmail', () => {
    const verifyEmailDto: VerifyEmailDto = {
      token: 'valid-verification-token',
    };

    it('returns success message when email is verified successfully', async () => {
      authService.verifyEmail.mockResolvedValue(undefined);
      const i18n = createMockI18nContext({
        'auth.info.email_verified_successfully': 'Email verified successfully',
      });

      const result = await controller.verifyEmail(verifyEmailDto, i18n);

      expect(authService.verifyEmail).toHaveBeenCalledWith(verifyEmailDto, i18n);
      expect(result).toEqual({ message: 'Email verified successfully' });
    });

    it('propagates BadRequestException when email is already verified', async () => {
      authService.verifyEmail.mockRejectedValue(new BadRequestException('Email already verified'));

      await expect(controller.verifyEmail(verifyEmailDto, createMockI18nContext())).rejects.toThrow(BadRequestException);
    });
  });

  describe('resendVerification', () => {
    const resendDto: ResendVerificationEmailDto = {
      email: 'test@example.com',
    };

    it('returns success message when verification email is resent', async () => {
      authService.resendVerificationEmail.mockResolvedValue(undefined);
      const i18n = createMockI18nContext({
        'auth.info.verification_email_resent': 'Verification email has been resent',
      });

      const result = await controller.resendVerification(resendDto, i18n);

      expect(authService.resendVerificationEmail).toHaveBeenCalledWith(resendDto, i18n);
      expect(result).toEqual({ message: 'Verification email has been resent' });
    });

    it('silently succeeds even when email is not found', async () => {
      authService.resendVerificationEmail.mockResolvedValue(undefined);
      const i18n = createMockI18nContext({
        'auth.info.verification_email_resent': 'Verification email has been resent',
      });

      const result = await controller.resendVerification(resendDto, i18n);

      expect(result).toEqual({ message: 'Verification email has been resent' });
    });
  });

  describe('getMe', () => {
    it('returns the current user from the request', () => {
      const result = controller.getMe(mockUser);

      expect(result).toEqual(mockUser);
    });
  });

  describe('googleAuth', () => {
    it('does not throw and returns void (Passport handles redirect)', () => {
      expect(() => controller.googleAuth()).not.toThrow();
    });
  });

  describe('googleAuthCallback', () => {
    const googleUser: IGoogleUser = {
      providerId: 'google-id-123',
      email: 'google@example.com',
      firstName: 'Jane',
      lastName: 'Smith',
      avatar: 'https://example.com/avatar.jpg',
    };

    it('returns auth tokens after successful Google login', async () => {
      authService.loginWithGoogle.mockResolvedValue(mockTokens);

      const result = await controller.googleAuthCallback({ user: googleUser });

      expect(authService.loginWithGoogle).toHaveBeenCalledWith(googleUser);
      expect(result).toEqual(mockTokens);
    });
  });
});
