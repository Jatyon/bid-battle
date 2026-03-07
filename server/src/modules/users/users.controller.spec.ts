import { Test, TestingModule } from '@nestjs/testing';
import { createUserFixture } from '@test/fixtures/users.fixtures';
import { UserPreferencesService } from './user-preferences.service';
import { UsersController } from './users.controller';
import { UpdateUserPreferencesDto } from './dto';
import { UsersService } from './users.service';
import { UserPreferences } from './entities';
import { createMock, DeepMocked } from '@golevelup/ts-jest';

describe('UsersController', () => {
  let controller: UsersController;
  let userPreferencesService: DeepMocked<UserPreferencesService>;

  const mockUser = createUserFixture();
  const mockUserPreferences: UserPreferences = {
    userId: 1,
    notifyOnOutbid: true,
    notifyOnAuctionEnd: true,
    user: mockUser,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        {
          provide: UsersService,
          useValue: createMock<UsersService>(),
        },
        {
          provide: UserPreferencesService,
          useValue: createMock<UserPreferencesService>(),
        },
      ],
    }).compile();

    controller = module.get<UsersController>(UsersController);
    userPreferencesService = module.get(UserPreferencesService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getUserPreferences', () => {
    it('should return user preferences', async () => {
      userPreferencesService.findByUserId.mockResolvedValue(mockUserPreferences);

      const result = await controller.getUserPreferences(mockUser);

      expect(userPreferencesService.findByUserId).toHaveBeenCalledWith(mockUser.id);
      expect(result).toEqual(mockUserPreferences);
    });
  });

  describe('updateUserPreferences', () => {
    const updateDto: UpdateUserPreferencesDto = {
      notifyOnOutbid: false,
      notifyOnAuctionEnd: true,
    };

    it('should update user preferences', async () => {
      const updatedPreferences = {
        ...mockUserPreferences,
        notifyOnOutbid: false,
      };
      userPreferencesService.updatePreferences.mockResolvedValue(updatedPreferences);

      const result = await controller.updateUserPreferences(mockUser, updateDto);

      expect(userPreferencesService.updatePreferences).toHaveBeenCalledWith(mockUser.id, updateDto);
      expect(result).toEqual(updatedPreferences);
    });

    it('should update preferences with partial data', async () => {
      const partialUpdateDto: UpdateUserPreferencesDto = {
        notifyOnOutbid: false,
      };
      const updatedPreferences = {
        ...mockUserPreferences,
        notifyOnOutbid: false,
      };
      userPreferencesService.updatePreferences.mockResolvedValue(updatedPreferences);

      const result = await controller.updateUserPreferences(mockUser, partialUpdateDto);

      expect(userPreferencesService.updatePreferences).toHaveBeenCalledWith(mockUser.id, partialUpdateDto);
      expect(result).toEqual(updatedPreferences);
    });
  });
});
