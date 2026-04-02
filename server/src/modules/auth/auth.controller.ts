import { ApiTags, ApiOperation, ApiBearerAuth, ApiOkResponse, ApiBadRequestResponse, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { Body, ClassSerializerInterceptor, Controller, Get, HttpCode, HttpStatus, Post, Req, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiStandardResponse, CurrentUser, Public } from '@core/decorators';
import { MessageResponse } from '@core/models';
import { User } from '@modules/users';
import { AuthRegisterDto, AuthLoginDto, RefreshTokenDto, ForgotPasswordDto, AuthResetPasswordDto, AuthChangePasswordDto, VerifyEmailDto, ResendVerificationEmailDto } from './dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { GoogleOAuthGuard } from './guards/google-oauth.guard';
import { AuthService } from './auth.service';
import { AuthTokens } from './models';
import { IGoogleUser } from './interfaces';
import { I18n, I18nContext } from 'nestjs-i18n';

@ApiTags('Authentication')
@Controller('/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @ApiOperation({
    summary: 'Register new user',
    description: 'Create a new user account with email and password',
  })
  @ApiStandardResponse(MessageResponse, false)
  @Public()
  @Post('register')
  async register(@Body() registerDto: AuthRegisterDto, @I18n() i18n: I18nContext): Promise<MessageResponse> {
    await this.authService.register(registerDto, i18n);
    return {
      message: i18n.t('auth.info.registration_completed_successfully'),
    };
  }

  @ApiOperation({
    summary: 'User login',
    description: 'Authenticate user and return JWT tokens',
  })
  @ApiOkResponse({
    description: 'Login successful',
    type: AuthTokens,
  })
  @ApiBadRequestResponse({ description: 'Invalid credentials' })
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() loginDto: AuthLoginDto, @I18n() i18n: I18nContext): Promise<AuthTokens> {
    return this.authService.login(loginDto, i18n);
  }

  @ApiOperation({
    summary: 'Refresh access token',
    description: 'Get new access token using refresh token',
  })
  @ApiOkResponse({
    description: 'Token refreshed successfully',
    type: AuthTokens,
  })
  @ApiBadRequestResponse({ description: 'Invalid refresh token' })
  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refreshToken(@Body() refreshTokenDto: RefreshTokenDto, @I18n() i18n: I18nContext): Promise<AuthTokens> {
    return this.authService.refreshToken(refreshTokenDto, i18n);
  }

  @ApiOperation({
    summary: 'Forgot password',
    description: 'Send password reset email to user',
  })
  @ApiStandardResponse(MessageResponse, false)
  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto, @I18n() i18n: I18nContext): Promise<MessageResponse> {
    await this.authService.forgotPassword(forgotPasswordDto, i18n);
    return {
      message: i18n.t('auth.info.password_reset_link_sent'),
    };
  }

  @ApiOperation({
    summary: 'Reset password',
    description: 'Reset user password using token from email',
  })
  @ApiStandardResponse(MessageResponse, false)
  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() resetPasswordDto: AuthResetPasswordDto, @I18n() i18n: I18nContext) {
    await this.authService.resetPassword(resetPasswordDto, i18n);
    return { message: i18n.t('auth.info.password_successfully_changed') };
  }

  @ApiOperation({
    summary: 'Change password',
    description: 'Change user password (requires authentication)',
  })
  @ApiStandardResponse(MessageResponse, false)
  @ApiBearerAuth('jwt-auth')
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('change-password')
  async changePassword(@CurrentUser() user: User, @Body() changePasswordDto: AuthChangePasswordDto, @I18n() i18n: I18nContext) {
    await this.authService.changePassword(user.email, changePasswordDto, i18n);
    return { message: i18n.t('auth.info.password_successfully_changed') };
  }

  @ApiOperation({
    summary: 'Verify email address',
    description: 'Confirm email address using the token received in the registration email',
  })
  @ApiStandardResponse(MessageResponse, false)
  @Public()
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  async verifyEmail(@Body() verifyEmailDto: VerifyEmailDto, @I18n() i18n: I18nContext): Promise<MessageResponse> {
    await this.authService.verifyEmail(verifyEmailDto, i18n);
    return { message: i18n.t('auth.info.email_verified_successfully') };
  }

  @ApiOperation({
    summary: 'Resend verification email',
    description: 'Resend the email verification link. Silently succeeds even if email is not found.',
  })
  @ApiStandardResponse(MessageResponse, false)
  @Public()
  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  async resendVerification(@Body() dto: ResendVerificationEmailDto, @I18n() i18n: I18nContext): Promise<MessageResponse> {
    await this.authService.resendVerificationEmail(dto, i18n);
    return { message: i18n.t('auth.info.verification_email_resent') };
  }

  @ApiOperation({
    summary: 'Initiate Google OAuth2 login',
    description: 'Redirects the user to Google login page',
  })
  @Public()
  @UseGuards(GoogleOAuthGuard)
  @Get('google')
  googleAuth(): void {
    // Passport handles the redirect
  }

  @ApiOperation({
    summary: 'Google OAuth2 callback',
    description: 'Handles Google OAuth2 callback and returns JWT tokens',
  })
  @ApiOkResponse({ description: 'Login successful', type: AuthTokens })
  @Public()
  @UseGuards(GoogleOAuthGuard)
  @Get('google/callback')
  googleAuthCallback(@Req() req: { user: IGoogleUser }): Promise<AuthTokens> {
    return this.authService.loginWithGoogle(req.user);
  }

  @ApiOperation({
    summary: 'Get current user profile',
    description: 'Get authenticated user information',
  })
  @ApiStandardResponse(User, false)
  @ApiBearerAuth('jwt-auth')
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(ClassSerializerInterceptor)
  @Get('me')
  getMe(@CurrentUser() user: User): User {
    return user;
  }
}
