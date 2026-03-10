import { ApiTags, ApiOperation, ApiBearerAuth, ApiOkResponse, ApiBadRequestResponse, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiStandardResponse, CurrentUser, Public } from '@core/decorators';
import { MessageResponse } from '@core/models';
import { User } from '@modules/users';
import { AuthRegisterDto, AuthLoginDto, RefreshTokenDto, ForgotPasswordDto, AuthResetPasswordDto, AuthChangePasswordDto } from './dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { AuthService } from './auth.service';
import { AuthTokens } from './models';
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
  @Post('change-password')
  async changePassword(@CurrentUser() user: User, @Body() changePasswordDto: AuthChangePasswordDto, @I18n() i18n: I18nContext) {
    await this.authService.changePassword(user.email, changePasswordDto, i18n);
    return { message: i18n.t('auth.info.password_successfully_changed') };
  }

  @ApiOperation({
    summary: 'Get current user profile',
    description: 'Get authenticated user information',
  })
  @ApiStandardResponse(User, false)
  @ApiBearerAuth('jwt-auth')
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @UseGuards(JwtAuthGuard)
  @Get('me')
  getMe(@CurrentUser() user: User): User {
    return user;
  }
}
