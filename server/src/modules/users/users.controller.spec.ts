import { Test, TestingModule } from '@nestjs/testing';
import { Language } from '@core/enums/language.enum';
import { createUserFixture } from '@test/fixtures/users.fixtures';
import { UserPreferencesService } from './user-preferences.service';
import { UsersController } from './users.controller';
import { UpdateUserPreferencesDto } from './dto';
import { UsersService } from './users.service';
import { UserPreferences } from './entities';
import { createMock, DeepMocked } from '@golevelup/ts-jest';
import { I18nContext } from 'nestjs-i18n';

describe('UsersController', () => {
  let controller: UsersController;
  let userPreferencesService: DeepMocked<UserPreferencesService>;
  let usersService: DeepMocked<UsersService>;

  const mockUser = createUserFixture();
  const mockUserPreferences: UserPreferences = {
    userId: 1,
    lang: Language.EN,
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
    usersService = module.get(UsersService);
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

  describe('deleteAccount', () => {
    const mockI18n = {
      t: jest.fn().mockReturnValue('Account successfully deleted'),
    } as unknown as I18nContext;

    it('should call usersService.deleteAccount and return a translated message', async () => {
      usersService.deleteAccount.mockResolvedValue(undefined);

      const result = await controller.deleteAccount(mockUser, mockI18n);

      expect(usersService.deleteAccount).toHaveBeenCalledWith(mockUser.id);
      expect(mockI18n.t).toHaveBeenCalledWith('user.info.account_deleted');
      expect(result).toEqual({
        message: 'Account successfully deleted',
      });
    });

    it('should propagate errors thrown by usersService', async () => {
      const error = new Error('Database connection failed');
      usersService.deleteAccount.mockRejectedValue(error);

      await expect(controller.deleteAccount(mockUser, mockI18n)).rejects.toThrow(error);

      expect(usersService.deleteAccount).toHaveBeenCalledWith(mockUser.id);
    });
  });
});
