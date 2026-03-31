import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Language } from '@core/enums/language.enum';
import { createUserFixture } from '@test/fixtures/users.fixtures';
import { UserPreferencesService } from './user-preferences.service';
import { UserPreferences } from './entities';
import { createMock, DeepMocked } from '@golevelup/ts-jest';
import { Repository } from 'typeorm';

describe('UserPreferencesService', () => {
  let service: UserPreferencesService;
  let repository: DeepMocked<Repository<UserPreferences>>;

  const mockUserPreferences: UserPreferences = {
    userId: 1,
    lang: Language.EN,
    notifyOnOutbid: true,
    notifyOnAuctionEnd: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    user: createUserFixture(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserPreferencesService,
        {
          provide: getRepositoryToken(UserPreferences),
          useValue: createMock<Repository<UserPreferences>>(),
        },
      ],
    }).compile();

    service = module.get<UserPreferencesService>(UserPreferencesService);
    repository = module.get(getRepositoryToken(UserPreferences));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findByUserId', () => {
    it('should return existing preferences', async () => {
      repository.findOne.mockResolvedValue(mockUserPreferences);

      const result = await service.findByUserId(1);

      expect(repository.findOne).toHaveBeenCalledWith({
        where: { userId: 1 },
      });
      expect(result).toEqual(mockUserPreferences);
    });

    it('should return null if no preferences exist', async () => {
      repository.findOne.mockResolvedValue(null);

      const result = await service.findByUserId(2);

      expect(repository.findOne).toHaveBeenCalledWith({
        where: { userId: 2 },
      });
      expect(result).toBeNull();
    });
  });

  describe('findOrCreateByUserId', () => {
    it('should return existing preferences when found', async () => {
      repository.findOne.mockResolvedValue(mockUserPreferences);

      const result = await service.findOrCreateByUserId(1);

      expect(repository.findOne).toHaveBeenCalledWith({ where: { userId: 1 } });
      expect(repository.create).not.toHaveBeenCalled();
      expect(result).toEqual(mockUserPreferences);
    });

    it('should create and return default preferences when not found', async () => {
      const defaultPreferences = { ...mockUserPreferences, userId: 99 };
      repository.findOne.mockResolvedValue(null);
      repository.create.mockReturnValue(defaultPreferences);
      repository.save.mockResolvedValue(defaultPreferences);

      const result = await service.findOrCreateByUserId(99);

      expect(repository.create).toHaveBeenCalledWith({
        userId: 99,
        notifyOnOutbid: true,
        notifyOnAuctionEnd: true,
      });
      expect(repository.save).toHaveBeenCalledWith(defaultPreferences);
      expect(result).toEqual(defaultPreferences);
    });
  });

  describe('updatePreferences', () => {
    it('should update existing preferences', async () => {
      const existingPreferences = { ...mockUserPreferences };
      const updatedPreferences = {
        ...existingPreferences,
        lang: Language.EN,
        notifyOnOutbid: false,
        notifyOnAuctionEnd: false,
      };
      repository.findOne.mockResolvedValue(existingPreferences);
      repository.save.mockResolvedValue(updatedPreferences);

      const result = await service.updatePreferences(1, { lang: Language.EN, notifyOnOutbid: false, notifyOnAuctionEnd: false });

      expect(repository.findOne).toHaveBeenCalledWith({
        where: { userId: 1 },
      });
      expect(existingPreferences.notifyOnOutbid).toBe(false);
      expect(repository.save).toHaveBeenCalledWith(existingPreferences);
      expect(result).toEqual(updatedPreferences);
    });

    it('should create default preferences and update them when not found', async () => {
      const defaultPreferences = { ...mockUserPreferences, userId: 7 };
      const updatedPreferences = { ...defaultPreferences, notifyOnOutbid: false, notifyOnAuctionEnd: false };
      repository.findOne.mockResolvedValue(null);
      repository.create.mockReturnValue(defaultPreferences);
      repository.save.mockResolvedValueOnce(defaultPreferences).mockResolvedValueOnce(updatedPreferences);

      const result = await service.updatePreferences(7, { lang: Language.EN, notifyOnOutbid: false, notifyOnAuctionEnd: false });

      expect(repository.create).toHaveBeenCalledWith({ userId: 7, notifyOnOutbid: true, notifyOnAuctionEnd: true });
      expect(result).toEqual(updatedPreferences);
    });
  });

  describe('createDefaultPreferences', () => {
    it('should create preferences with default values', async () => {
      const defaultPreferences = { ...mockUserPreferences, userId: 5 };
      repository.create.mockReturnValue(defaultPreferences);
      repository.save.mockResolvedValue(defaultPreferences);

      const result = await service.createDefaultPreferences(5);

      expect(repository.create).toHaveBeenCalledWith({
        userId: 5,
        notifyOnOutbid: true,
        notifyOnAuctionEnd: true,
      });
      expect(repository.save).toHaveBeenCalledWith(defaultPreferences);
      expect(result).toEqual(defaultPreferences);
    });
  });
});
