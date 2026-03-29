import { Test, TestingModule } from '@nestjs/testing';
import { Language } from '@core/enums/language.enum';
import { createUserFixture } from '@test/fixtures/users.fixtures';
import { UserPreferencesService } from './user-preferences.service';
import { UsersController } from './users.controller';
import { UpdateProfileDto, UpdateUserPreferencesDto } from './dto';
import { UsersService } from './users.service';
import { User, UserPreferences } from './entities';
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
    createdAt: new Date(),
    updatedAt: new Date(),
    user: createUserFixture(),
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
      lang: Language.EN,
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
  });

  describe('updateProfile', () => {
    const updateDto: UpdateProfileDto = {
      firstName: 'Jane',
      lastName: 'Smith',
    };

    const mockI18n = {
      t: jest.fn().mockReturnValue('User not found.'),
    } as unknown as I18nContext;

    it('should call usersService.updateProfile with correct arguments and return the updated user', async () => {
      const updatedUser = { ...mockUser, ...updateDto } as User;

      usersService.updateProfile.mockResolvedValue(updatedUser);

      const result = await controller.updateProfile(mockUser, updateDto, mockI18n);

      expect(usersService.updateProfile).toHaveBeenCalledWith(mockUser.id, updateDto, mockI18n);
      expect(result).toEqual(updatedUser);
    });

    it('should propagate errors thrown by usersService', async () => {
      const error = new Error('Failed to update profile');
      usersService.updateProfile.mockRejectedValue(error);

      await expect(controller.updateProfile(mockUser, updateDto, mockI18n)).rejects.toThrow(error);

      expect(usersService.updateProfile).toHaveBeenCalledWith(mockUser.id, updateDto, mockI18n);
    });
  });

  describe('uploadAvatar', () => {
    const mockFile = {
      originalname: 'avatar.jpg',
      mimetype: 'image/jpeg',
      size: 1024,
      buffer: Buffer.from('fake-image-data'),
    } as Express.Multer.File;

    const mockI18n = {
      t: jest.fn().mockReturnValue('Avatar uploaded'),
    } as unknown as I18nContext;

    it('should call usersService.updateAvatar and return the updated user', async () => {
      const updatedUser = { ...mockUser, avatar: '2026/03/avatars/random.jpg' } as User;
      usersService.updateAvatar.mockResolvedValue(updatedUser);

      const result = await controller.uploadAvatar(mockUser, mockFile, mockI18n);

      expect(usersService.updateAvatar).toHaveBeenCalledWith(mockUser.id, mockFile, mockI18n);
      expect(result).toEqual(updatedUser);
    });

    it('should propagate errors thrown by usersService.updateAvatar', async () => {
      const error = new Error('Upload failed');
      usersService.updateAvatar.mockRejectedValue(error);

      await expect(controller.uploadAvatar(mockUser, mockFile, mockI18n)).rejects.toThrow(error);
      expect(usersService.updateAvatar).toHaveBeenCalledWith(mockUser.id, mockFile, mockI18n);
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

  describe('deleteAvatar', () => {
    const mockI18n = {
      t: jest.fn().mockReturnValue('Avatar successfully deleted'),
    } as unknown as I18nContext;

    it('should call usersService.deleteAvatar and return a translated message', async () => {
      usersService.deleteAvatar.mockResolvedValue(undefined);

      const result = await controller.deleteAvatar(mockUser, mockI18n);

      expect(usersService.deleteAvatar).toHaveBeenCalledWith(mockUser.id);
      expect(mockI18n.t).toHaveBeenCalledWith('user.info.avatar_deleted');
      expect(result).toEqual({
        message: 'Avatar successfully deleted',
      });
    });

    it('should propagate errors thrown by usersService.deleteAvatar', async () => {
      const error = new Error('Failed to delete avatar');
      usersService.deleteAvatar.mockRejectedValue(error);

      await expect(controller.deleteAvatar(mockUser, mockI18n)).rejects.toThrow(error);
      expect(usersService.deleteAvatar).toHaveBeenCalledWith(mockUser.id);
    });
  });
});
