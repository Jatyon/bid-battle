import { TypeOrmModule } from '@nestjs/typeorm';
import { Module } from '@nestjs/common';
import { UserPreferencesService } from './user-preferences.service';
import { PublicUsersController } from './public-users.controller';
import { UserRepository } from './repositories/users.repository';
import { SocialAccountRepository } from './repositories/social-account.repository';
import { SocialAccountService } from './social-account.service';
import { UsersTokenService } from './users-token.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { ENTITIES } from './entities';

@Module({
  controllers: [UsersController, PublicUsersController],
  imports: [TypeOrmModule.forFeature(ENTITIES)],
  providers: [UsersService, UsersTokenService, UserPreferencesService, UserRepository, SocialAccountRepository, SocialAccountService],
  exports: [UsersService, UsersTokenService, UserPreferencesService, UserRepository, SocialAccountRepository, SocialAccountService, TypeOrmModule],
})
export class UsersModule {}
