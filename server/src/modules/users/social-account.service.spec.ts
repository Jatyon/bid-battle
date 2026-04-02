import { Test, TestingModule } from '@nestjs/testing';
import { createMock, DeepMocked } from '@golevelup/ts-jest';
import { SocialAccountRepository } from './repositories/social-account.repository';
import { SocialAccountService } from './social-account.service';
import { SocialAccount } from './entities/social-account.entity';
import { SocialProviderEnum } from './enums';

describe('SocialAccountService', () => {
  let service: SocialAccountService;
  let repository: DeepMocked<SocialAccountRepository>;

  const mockSocialAccount = (): SocialAccount => {
    const account = new SocialAccount();
    Object.assign(account, {
      id: 1,
      provider: SocialProviderEnum.GOOGLE,
      providerId: 'google-id-123',
      userId: 42,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    return account;
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SocialAccountService, { provide: SocialAccountRepository, useValue: createMock<SocialAccountRepository>() }],
    }).compile();

    service = module.get<SocialAccountService>(SocialAccountService);
    repository = module.get(SocialAccountRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findByProvider', () => {
    it('should return social account when found', async () => {
      const account = mockSocialAccount();
      repository.findByProvider.mockResolvedValue(account);

      const result = await service.findByProvider(SocialProviderEnum.GOOGLE, 'google-id-123');

      expect(repository.findByProvider).toHaveBeenCalledWith(SocialProviderEnum.GOOGLE, 'google-id-123');
      expect(result).toEqual(account);
    });

    it('should return null when social account not found', async () => {
      repository.findByProvider.mockResolvedValue(null);

      const result = await service.findByProvider(SocialProviderEnum.GOOGLE, 'nonexistent-id');

      expect(repository.findByProvider).toHaveBeenCalledWith(SocialProviderEnum.GOOGLE, 'nonexistent-id');
      expect(result).toBeNull();
    });
  });

  describe('createForUser', () => {
    it('should create and save a social account for the given user', async () => {
      const account = mockSocialAccount();
      repository.create.mockReturnValue(account);
      repository.save.mockResolvedValue(account);

      const result = await service.createForUser(SocialProviderEnum.GOOGLE, 'google-id-123', 42);

      expect(repository.create).toHaveBeenCalledWith({
        provider: SocialProviderEnum.GOOGLE,
        providerId: 'google-id-123',
        userId: 42,
      });
      expect(repository.save).toHaveBeenCalledWith(account);
      expect(result).toEqual(account);
    });

    it('should propagate errors from the repository', async () => {
      repository.create.mockReturnValue(mockSocialAccount());
      repository.save.mockRejectedValue(new Error('DB error'));

      await expect(service.createForUser(SocialProviderEnum.GOOGLE, 'google-id-123', 42)).rejects.toThrow('DB error');
    });
  });
});
