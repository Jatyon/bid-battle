import { Injectable } from '@nestjs/common';
import { UserRepository } from '../repositories/users.repository';
import { User } from '../entities/user.entity';
import { DeepPartial, FindOptionsWhere, UpdateResult } from 'typeorm';

@Injectable()
export class UsersService {
  constructor(private readonly userRepository: UserRepository) {}

  findOneBy(data: FindOptionsWhere<User>): Promise<User | null> {
    return this.userRepository.findOneBy(data);
  }

  findOneWithPasswordByEmail(email: string): Promise<User | null> {
    return this.userRepository.findOneWithPasswordByEmail(email);
  }

  create(data: DeepPartial<User>): User {
    return this.userRepository.create(data);
  }

  save(data: DeepPartial<User>): Promise<User> {
    return this.userRepository.save(data);
  }

  updateBy(where: FindOptionsWhere<User>, data: Partial<User>): Promise<UpdateResult> {
    return this.userRepository.update(where, data);
  }
}
