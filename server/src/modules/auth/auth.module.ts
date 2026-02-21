import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { UsersService } from '@modules/users/services/users.service';
import { UsersModule } from '@modules/users/users.module';
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
  providers: [AuthService, UsersService, AuthJwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
