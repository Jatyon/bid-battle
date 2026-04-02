import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { SocialAccount } from '../entities/social-account.entity';
import { SocialProviderEnum } from '../enums';

@Injectable()
export class SocialAccountRepository extends Repository<SocialAccount> {
  constructor(private dataSource: DataSource) {
    super(SocialAccount, dataSource.createEntityManager());
  }

  findByProvider(provider: SocialProviderEnum, providerId: string): Promise<SocialAccount | null> {
    return this.findOne({ where: { provider, providerId }, relations: ['user'] });
  }
}
