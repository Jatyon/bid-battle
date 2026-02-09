import { TypeOrmModule } from '@nestjs/typeorm';
import { Module } from '@nestjs/common';
import { UsersController } from '@modules/users/controllers/users.controller';
import { UserRepository } from './repositories/users.repository';
import { SocialAccount } from './entities/social-account.entity';
import { UsersService } from './services/users.service';
import { User } from './entities/user.entity';

@Module({
  controllers: [UsersController],
  imports: [TypeOrmModule.forFeature([User, SocialAccount])],
  providers: [UsersService, UserRepository],
  exports: [UsersService, UserRepository],
})
export class UsersModule {}
