import { Injectable } from '@nestjs/common';
import { User } from '../entities/user.entity';
import { SearchUsersDto } from '../dto';
import { DataSource, Repository } from 'typeorm';

@Injectable()
export class UserRepository extends Repository<User> {
  constructor(private dataSource: DataSource) {
    super(User, dataSource.createEntityManager());
  }

  findOneWithPasswordByEmail(email: string): Promise<User | null> {
    return this.createQueryBuilder('user').where('user.email = :email', { email }).addSelect('user.password').getOne();
  }

  async searchUsers(queryDto: SearchUsersDto): Promise<User[]> {
    const { q, limit = 10 } = queryDto;

    const queryBuilder = this.createQueryBuilder('user');

    if (q) {
      const escaped = q.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
      queryBuilder.where('user.firstName LIKE :search OR user.lastName LIKE :search', { search: `%${escaped}%` }).setParameter('escape', '\\');
    }

    return queryBuilder.take(limit).orderBy('user.createdAt', 'DESC').getMany();
  }
}
