import { TypeOrmModule } from '@nestjs/typeorm';
import { Module } from '@nestjs/common';
import { UserRepository } from './repositories/users.repository';
import { UsersTokenService } from './users-token.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { ENTITIES } from './entities';

@Module({
  controllers: [UsersController],
  imports: [TypeOrmModule.forFeature(ENTITIES)],
  providers: [UsersService, UsersTokenService, UserRepository],
  exports: [UsersService, UsersTokenService, UserRepository, TypeOrmModule],
})
export class UsersModule {}
