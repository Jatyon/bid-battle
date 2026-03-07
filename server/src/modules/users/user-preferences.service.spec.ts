import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { createUserFixture } from '@test/fixtures/users.fixtures';
import { UserPreferencesService } from './user-preferences.service';
import { UpdateUserPreferencesDto } from './dto';
import { UserPreferences } from './entities';
import { createMock, DeepMocked } from '@golevelup/ts-jest';
import { Repository } from 'typeorm';

describe('UserPreferencesService', () => {
  let service: UserPreferencesService;
  let repository: DeepMocked<Repository<UserPreferences>>;

  const mockUserPreferences: UserPreferences = {
    userId: 1,
    notifyOnOutbid: true,
    notifyOnAuctionEnd: true,
    user: createUserFixture(),
  };

  const mockUpdateDto: UpdateUserPreferencesDto = {
    notifyOnOutbid: false,
    notifyOnAuctionEnd: true,
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

    it('should create default preferences if none exist', async () => {
      const defaultPreferences = { ...mockUserPreferences, userId: 2 };
      repository.findOne.mockResolvedValue(null);
      repository.create.mockReturnValue(defaultPreferences);
      repository.save.mockResolvedValue(defaultPreferences);

      const result = await service.findByUserId(2);

      expect(repository.findOne).toHaveBeenCalledWith({
        where: { userId: 2 },
      });
      expect(repository.create).toHaveBeenCalledWith({
        userId: 2,
        notifyOnOutbid: true,
        notifyOnAuctionEnd: true,
      });
      expect(repository.save).toHaveBeenCalledWith(defaultPreferences);
      expect(result).toEqual(defaultPreferences);
    });
  });

  describe('updatePreferences', () => {
    it('should create new preferences if none exist', async () => {
      const newPreferences = {
        ...mockUserPreferences,
        userId: 3,
        notifyOnOutbid: false,
        notifyOnAuctionEnd: true,
      };
      repository.findOne.mockResolvedValue(null);
      repository.create.mockReturnValue(newPreferences);
      repository.save.mockResolvedValue(newPreferences);

      const result = await service.updatePreferences(3, mockUpdateDto);

      expect(repository.findOne).toHaveBeenCalledWith({
        where: { userId: 3 },
      });
      expect(repository.create).toHaveBeenCalledWith({
        userId: 3,
        notifyOnOutbid: false,
        notifyOnAuctionEnd: true,
      });
      expect(repository.save).toHaveBeenCalledWith(newPreferences);
      expect(result).toEqual(newPreferences);
    });

    it('should update existing preferences', async () => {
      const existingPreferences = { ...mockUserPreferences };
      const updatedPreferences = {
        ...existingPreferences,
        notifyOnOutbid: false,
      };
      repository.findOne.mockResolvedValue(existingPreferences);
      repository.save.mockResolvedValue(updatedPreferences);

      const result = await service.updatePreferences(1, { notifyOnOutbid: false });

      expect(repository.findOne).toHaveBeenCalledWith({
        where: { userId: 1 },
      });
      expect(existingPreferences.notifyOnOutbid).toBe(false);
      expect(repository.save).toHaveBeenCalledWith(existingPreferences);
      expect(result).toEqual(updatedPreferences);
    });

    it('should update only provided fields', async () => {
      const existingPreferences = { ...mockUserPreferences };
      const updatedPreferences = {
        ...existingPreferences,
        notifyOnAuctionEnd: false,
      };
      repository.findOne.mockResolvedValue(existingPreferences);
      repository.save.mockResolvedValue(updatedPreferences);

      const result = await service.updatePreferences(1, { notifyOnAuctionEnd: false });

      expect(repository.findOne).toHaveBeenCalledWith({
        where: { userId: 1 },
      });
      expect(existingPreferences.notifyOnOutbid).toBe(true); // unchanged
      expect(existingPreferences.notifyOnAuctionEnd).toBe(false); // changed
      expect(repository.save).toHaveBeenCalledWith(existingPreferences);
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

  describe('deletePreferences', () => {
    it('should delete preferences for user', async () => {
      repository.delete.mockResolvedValue({ affected: 1, raw: {} });

      await service.deletePreferences(1);

      expect(repository.delete).toHaveBeenCalledWith({ userId: 1 });
    });
  });
});
