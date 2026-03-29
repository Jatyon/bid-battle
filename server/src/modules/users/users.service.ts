import { Injectable, NotFoundException } from '@nestjs/common';
import { UserRepository } from './repositories/users.repository';
import { User } from './entities/user.entity';
import { DeepPartial, FindOptionsWhere, UpdateResult } from 'typeorm';
import { UserToken } from './entities';
import { UpdateProfileDto } from './dto';

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

  async updateProfile(userId: number, dto: UpdateProfileDto): Promise<User> {
    const user = await this.userRepository.findOneBy({ id: userId });

    if (!user) throw new NotFoundException('User not found');

    if (dto.firstName) user.firstName = dto.firstName;
    if (dto.lastName) user.lastName = dto.lastName;

    return this.userRepository.save(user);
  }

  async deleteAccount(userId: number): Promise<void> {
    await this.userRepository.manager.transaction(async (transactionalEntityManager) => {
      await transactionalEntityManager.softDelete(User, { id: userId });
      await transactionalEntityManager.delete(UserToken, { userId });
    });
  }
}
