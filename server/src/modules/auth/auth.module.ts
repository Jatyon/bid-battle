import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { UsersModule, UsersService, UsersTokenService, SocialAccountService } from '@modules/users';
import { GoogleOAuthStrategy } from './strategies/google-oauth.strategy';
import { JwtConfigProvider } from './providers/jwt-config.provider';
import { AuthJwtStrategy } from './strategies/auth-jwt.strategy';
import { GoogleOAuthGuard } from './guards/google-oauth.guard';
import { AuthController } from './auth.controller';
import { WsJwtGuard } from './guards/ws-jwt.guard';
import { AuthService } from './auth.service';

@Module({
  controllers: [AuthController],
  imports: [
    UsersModule,
    JwtModule.registerAsync({
      useClass: JwtConfigProvider,
    }),
  ],
  providers: [AuthService, UsersService, UsersTokenService, AuthJwtStrategy, WsJwtGuard, GoogleOAuthStrategy, GoogleOAuthGuard, SocialAccountService],
  exports: [AuthService, WsJwtGuard, JwtModule],
})
export class AuthModule {}
