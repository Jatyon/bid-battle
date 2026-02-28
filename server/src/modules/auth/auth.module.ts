import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { UsersModule, UsersService, UsersTokenService } from '@modules/users';
import { JwtConfigProvider } from './providers/jwt-config.provider';
import { AuthJwtStrategy } from './strategies/auth-jwt.strategy';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  controllers: [AuthController],
  imports: [
    UsersModule,
    JwtModule.registerAsync({
      useClass: JwtConfigProvider,
    }),
  ],
  providers: [AuthService, UsersService, UsersTokenService, AuthJwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
