import { Injectable } from '@nestjs/common';
import { User } from '../entities/user.entity';
import { DataSource, Repository } from 'typeorm';

@Injectable()
export class UserRepository extends Repository<User> {
  constructor(private dataSource: DataSource) {
    super(User, dataSource.createEntityManager());
  }

  findOneWithPasswordByEmail(email: string): Promise<User | null> {
    return this.createQueryBuilder('user').where('user.email = :email', { email }).addSelect('user.password').getOne();
  }
}
