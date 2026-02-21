import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { MessageResponse } from '@core/models/message-response.model';
import { Public } from '@core/decorators/public.decorator';
import { AuthRegisterDto, AuthLoginDto, RefreshTokenDto } from './dto';
import { AuthService } from './auth.service';
import { IAuthTokens } from './interfaces';
import { I18n, I18nContext } from 'nestjs-i18n';

@Controller('/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  async register(@Body() registerDto: AuthRegisterDto, @I18n() i18n: I18nContext): Promise<MessageResponse> {
    await this.authService.register(registerDto, i18n);
    return {
      message: i18n.t('auth.info.registration_completed_successfully'),
    };
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() loginDto: AuthLoginDto, @I18n() i18n: I18nContext): Promise<IAuthTokens> {
    return this.authService.login(loginDto, i18n);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refreshToken(@Body() refreshTokenDto: RefreshTokenDto, @I18n() i18n: I18nContext): Promise<IAuthTokens> {
    return this.authService.refreshToken(refreshTokenDto, i18n);
  }
}
