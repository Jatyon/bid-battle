import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { SocialAccountRepository } from './social-account.repository';
import { SocialAccount } from '../entities/social-account.entity';
import { SocialProviderEnum } from '../enums';

describe('SocialAccountRepository', () => {
  let repository: SocialAccountRepository;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SocialAccountRepository,
        {
          provide: DataSource,
          useValue: {
            createEntityManager: jest.fn(),
          },
        },
      ],
    }).compile();

    repository = module.get<SocialAccountRepository>(SocialAccountRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findByProvider', () => {
    const mockAccount = (): SocialAccount => {
      const account = new SocialAccount();
      Object.assign(account, {
        id: 1,
        provider: SocialProviderEnum.GOOGLE,
        providerId: 'google-id-123',
        userId: 42,
        createdAt: new Date(),
        updatedAt: new Date(),
        user: { id: 42, email: 'test@example.com' },
      });
      return account;
    };

    it('should call findOne with correct provider, providerId and user relation', async () => {
      const account = mockAccount();
      jest.spyOn(repository, 'findOne').mockResolvedValue(account);

      const result = await repository.findByProvider(SocialProviderEnum.GOOGLE, 'google-id-123');

      expect(repository.findOne).toHaveBeenCalledWith({
        where: { provider: SocialProviderEnum.GOOGLE, providerId: 'google-id-123' },
        relations: ['user'],
      });
      expect(result).toEqual(account);
    });

    it('should return null when no account matches provider and providerId', async () => {
      jest.spyOn(repository, 'findOne').mockResolvedValue(null);

      const result = await repository.findByProvider(SocialProviderEnum.GOOGLE, 'nonexistent-id');

      expect(repository.findOne).toHaveBeenCalledWith({
        where: { provider: SocialProviderEnum.GOOGLE, providerId: 'nonexistent-id' },
        relations: ['user'],
      });
      expect(result).toBeNull();
    });

    it('should propagate errors from findOne', async () => {
      jest.spyOn(repository, 'findOne').mockRejectedValue(new Error('DB connection lost'));

      await expect(repository.findByProvider(SocialProviderEnum.GOOGLE, 'google-id-123')).rejects.toThrow('DB connection lost');
    });
  });
});
