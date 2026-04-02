import { Injectable } from '@nestjs/common';
import { SocialAccountRepository } from './repositories/social-account.repository';
import { SocialAccount } from './entities/social-account.entity';
import { SocialProviderEnum } from './enums';

@Injectable()
export class SocialAccountService {
  constructor(private readonly socialAccountRepository: SocialAccountRepository) {}

  findByProvider(provider: SocialProviderEnum, providerId: string): Promise<SocialAccount | null> {
    return this.socialAccountRepository.findByProvider(provider, providerId);
  }

  createForUser(provider: SocialProviderEnum, providerId: string, userId: number): Promise<SocialAccount> {
    return this.socialAccountRepository.save(this.socialAccountRepository.create({ provider, providerId, userId }));
  }
}
