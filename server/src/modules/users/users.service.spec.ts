import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { createUserFixture } from '@test/fixtures/users.fixtures';
import { createMockI18nContext } from '@test/mocks/i18n.mock';
import { FileUploadService, IUploadedFile } from '@shared/file-upload';
import { UserRepository } from './repositories/users.repository';
import { PublicUserProfileResponse, SearchUsersDto } from './dto';
import { UsersService } from './users.service';
import { User, UserToken } from './entities';
import { createMock, DeepMocked } from '@golevelup/ts-jest';
import { UpdateResult } from 'typeorm';

describe('UsersService', () => {
  let service: UsersService;
  let repository: DeepMocked<UserRepository>;
  let fileUploadService: DeepMocked<FileUploadService>;

  const mockUser = createUserFixture();

  const mockManager = {
    softDelete: jest.fn(),
    delete: jest.fn(),
  };

  const mockI18n = createMockI18nContext();

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: UserRepository,
          useValue: createMock<UserRepository>(),
        },
        {
          provide: FileUploadService,
          useValue: createMock<FileUploadService>(),
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    repository = module.get(UserRepository);
    fileUploadService = module.get(FileUploadService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findOneBy', () => {
    it('should return user if found', async () => {
      repository.findOneBy.mockResolvedValue(mockUser);
      const criteria = { id: 1 };

      const result = await service.findOneBy(criteria);

      expect(repository.findOneBy).toHaveBeenCalledWith(criteria);
      expect(result).toEqual(mockUser);
    });

    it('should return null if user is not found', async () => {
      repository.findOneBy.mockResolvedValue(null);
      const criteria = { id: 999 };

      const result = await service.findOneBy(criteria);

      expect(repository.findOneBy).toHaveBeenCalledWith(criteria);
      expect(result).toBeNull();
    });
  });

  describe('findOneWithPasswordByEmail', () => {
    const email = 'test@example.com';

    it('should return user with password if found', async () => {
      repository.findOneWithPasswordByEmail.mockResolvedValue(mockUser);

      const result = await service.findOneWithPasswordByEmail(email);

      expect(repository.findOneWithPasswordByEmail).toHaveBeenCalledWith(email);
      expect(result).toEqual(mockUser);
    });

    it('should return null if email does not exist', async () => {
      repository.findOneWithPasswordByEmail.mockResolvedValue(null);

      const result = await service.findOneWithPasswordByEmail(email);

      expect(repository.findOneWithPasswordByEmail).toHaveBeenCalledWith(email);
      expect(result).toBeNull();
    });
  });

  describe('searchPublicUsers', () => {
    it('should query the repository and map results to PublicUserProfileResponse', async () => {
      const queryDto = { q: 'Jan', limit: 5 } as SearchUsersDto;

      const mockDate1 = new Date('2026-01-01');
      const mockDate2 = new Date('2026-02-01');

      const user1 = { id: 1, firstName: 'John', lastName: 'Doe', createdAt: mockDate1 } as User;
      const user2 = { id: 2, firstName: 'Kevin', lastName: 'Rice', createdAt: mockDate2 } as User;

      repository.searchUsers.mockResolvedValue([user1, user2]);

      const result = await service.searchPublicUsers(queryDto);

      expect(repository.searchUsers).toHaveBeenCalledWith(queryDto);
      expect(result).toHaveLength(2);

      expect(result[0]).toBeInstanceOf(PublicUserProfileResponse);
      expect(result[0].id).toBe(1);
      expect(result[0].firstName).toBe('John');
      expect(result[0].lastNameInitial).toBe('D.');

      expect(result[1]).toBeInstanceOf(PublicUserProfileResponse);
      expect(result[1].id).toBe(2);
      expect(result[1].firstName).toBe('Kevin');
      expect(result[1].lastNameInitial).toBe('R.');
    });

    it('should handle empty results gracefully', async () => {
      const queryDto = { q: 'UnknownName', limit: 10 } as SearchUsersDto;
      repository.searchUsers.mockResolvedValue([]);

      const result = await service.searchPublicUsers(queryDto);

      expect(repository.searchUsers).toHaveBeenCalledWith(queryDto);
      expect(result).toEqual([]);
    });

    it('should propagate errors from the repository', async () => {
      const queryDto = { q: 'error', limit: 5 } as SearchUsersDto;
      const dbError = new Error('Database timeout');
      repository.searchUsers.mockRejectedValue(dbError);

      await expect(service.searchPublicUsers(queryDto)).rejects.toThrow(dbError);
      expect(repository.searchUsers).toHaveBeenCalledWith(queryDto);
    });
  });

  describe('getPublicProfile', () => {
    it('should throw NotFoundException if user does not exist', async () => {
      repository.findOneBy.mockResolvedValue(null);

      await expect(service.getPublicProfile(999, mockI18n)).rejects.toThrow(NotFoundException);
      expect(repository.findOneBy).toHaveBeenCalledWith({ id: 999 });
      expect(mockI18n.t).toHaveBeenCalledWith('user.error.user_not_found');
    });

    it('should return mapped PublicUserProfileResponse if user exists', async () => {
      const mockDate = new Date();
      const existingUser = {
        ...mockUser,
        id: 1,
        firstName: 'Anna',
        lastName: 'Kowalska',
        createdAt: mockDate,
      } as User;

      repository.findOneBy.mockResolvedValue(existingUser);

      const result = await service.getPublicProfile(1, mockI18n);

      expect(repository.findOneBy).toHaveBeenCalledWith({ id: 1 });
      expect(result).toBeInstanceOf(PublicUserProfileResponse);
      expect(result.firstName).toBe('Anna');
      expect(result.lastNameInitial).toBe('K.');
      expect(result.joinedAt).toBe(mockDate);
    });
  });

  describe('create', () => {
    it('should call repository.create and return user instance', () => {
      repository.create.mockReturnValue(mockUser);
      const userData = { email: 'test@example.com' };

      const result = service.create(userData);

      expect(repository.create).toHaveBeenCalledWith(userData);
      expect(result).toEqual(mockUser);
    });
  });

  describe('save', () => {
    it('should call repository.save and return saved user', async () => {
      repository.save.mockResolvedValue(mockUser);

      const result = await service.save(mockUser);

      expect(repository.save).toHaveBeenCalledWith(mockUser);
      expect(result).toEqual(mockUser);
    });
  });

  describe('updateBy', () => {
    it('should call repository.update with correct data', async () => {
      const mockUpdateResult: UpdateResult = { raw: [], affected: 1, generatedMaps: [] };
      repository.update.mockResolvedValue(mockUpdateResult);
      const criteria = { id: 1 };
      const data = { firstName: 'Updated' };

      const result = await service.updateBy(criteria, data);

      expect(repository.update).toHaveBeenCalledWith(criteria, data);
      expect(result).toEqual(mockUpdateResult);
    });

    it('should return affected: 0 if no user was updated', async () => {
      const emptyUpdateResult: UpdateResult = { raw: [], affected: 0, generatedMaps: [] };
      repository.update.mockResolvedValue(emptyUpdateResult);
      const criteria = { id: 999 };
      const data = { firstName: 'New Name' };

      const result = await service.updateBy(criteria, data);

      expect(result.affected).toBe(0);
      expect(repository.update).toHaveBeenCalled();
    });
  });

  describe('updateProfile', () => {
    it('should throw NotFoundException if user is not found', async () => {
      repository.findOneBy.mockResolvedValue(null);
      const dto = { firstName: 'NewName' };

      await expect(service.updateProfile(999, dto, mockI18n)).rejects.toThrow(NotFoundException);
      expect(repository.findOneBy).toHaveBeenCalledWith({ id: 999 });
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('should update both firstName and lastName and save the user', async () => {
      const existingUser = { ...mockUser, firstName: 'OldFirst', lastName: 'OldLast' } as User;
      const dto = { firstName: 'NewFirst', lastName: 'NewLast' };

      repository.findOneBy.mockResolvedValue(existingUser);
      repository.save.mockResolvedValue(existingUser);

      const result = await service.updateProfile(1, dto, mockI18n);

      expect(repository.findOneBy).toHaveBeenCalledWith({ id: 1 });
      expect(existingUser.firstName).toBe('NewFirst');
      expect(existingUser.lastName).toBe('NewLast');
      expect(repository.save).toHaveBeenCalledWith(existingUser);
      expect(result).toEqual(existingUser);
    });

    it('should update only provided fields (partial update)', async () => {
      const existingUser = { ...mockUser, firstName: 'OldFirst', lastName: 'OldLast' } as User;
      const dto = { lastName: 'NewLastOnly' };

      repository.findOneBy.mockResolvedValue(existingUser);
      repository.save.mockResolvedValue(existingUser);

      const result = await service.updateProfile(1, dto, mockI18n);

      expect(existingUser.firstName).toBe('OldFirst');
      expect(existingUser.lastName).toBe('NewLastOnly');
      expect(repository.save).toHaveBeenCalledWith(existingUser);
      expect(result).toEqual(existingUser);
    });
  });

  describe('updateAvatar', () => {
    const mockFile = {
      originalname: 'avatar.jpg',
      mimetype: 'image/jpeg',
      size: 1024,
      buffer: Buffer.from('fake-data'),
    } as Express.Multer.File;

    const mockUploadResult: IUploadedFile = {
      filename: 'random123.jpg',
      path: '/full/path/to/random123.jpg',
      url: 'avatars/random123.jpg',
      size: 1024,
      mimetype: 'image/jpeg',
    };

    it('should throw NotFoundException if user is not found', async () => {
      repository.findOneBy.mockResolvedValue(null);

      await expect(service.updateAvatar(999, mockFile, mockI18n)).rejects.toThrow(NotFoundException);
      expect(repository.findOneBy).toHaveBeenCalledWith({ id: 999 });
      expect(fileUploadService.uploadSingle).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException if upload fails', async () => {
      repository.findOneBy.mockResolvedValue(mockUser);
      fileUploadService.getAvatarUploadOptions.mockReturnValue({ maxSizeMB: 2, allowedTypes: ['image/jpeg'], subDir: 'avatars' });
      fileUploadService.uploadSingle.mockRejectedValue(new Error('Upload failed'));

      await expect(service.updateAvatar(1, mockFile, mockI18n)).rejects.toThrow(BadRequestException);
      expect(mockI18n.t).toHaveBeenCalledWith('user.error.update_avatar_failed');
    });

    it('should upload new avatar, update user, and NOT delete old avatar if user did not have one', async () => {
      const userWithoutAvatar = { ...mockUser, avatar: null } as User;
      repository.findOneBy.mockResolvedValue(userWithoutAvatar);
      fileUploadService.getAvatarUploadOptions.mockReturnValue({ maxSizeMB: 2, allowedTypes: [], subDir: 'avatars' });
      fileUploadService.uploadSingle.mockResolvedValue(mockUploadResult);
      repository.save.mockResolvedValue({ ...userWithoutAvatar, avatar: mockUploadResult.url } as User);

      const result = await service.updateAvatar(1, mockFile, mockI18n);

      expect(fileUploadService.uploadSingle).toHaveBeenCalledWith(mockFile, expect.any(Object), mockI18n);
      expect(fileUploadService.deleteFile).not.toHaveBeenCalled();
      expect(userWithoutAvatar.avatar).toBe(mockUploadResult.url);
      expect(repository.save).toHaveBeenCalledWith(userWithoutAvatar);
      expect(result.avatar).toBe(mockUploadResult.url);
    });

    it('should upload new avatar, delete OLD avatar AFTER DB save, and return saved user', async () => {
      const oldAvatarPath = 'avatars/old-pic.jpg';
      const userWithAvatar = { ...mockUser, avatar: oldAvatarPath } as User;
      const savedUser = { ...userWithAvatar, avatar: mockUploadResult.url } as User;

      repository.findOneBy.mockResolvedValue(userWithAvatar);
      fileUploadService.getAvatarUploadOptions.mockReturnValue({ maxSizeMB: 2, allowedTypes: [], subDir: 'avatars' });
      fileUploadService.uploadSingle.mockResolvedValue(mockUploadResult);
      fileUploadService.deleteFile.mockResolvedValue(undefined);
      repository.save.mockResolvedValue(savedUser);

      const deleteOrder: string[] = [];

      fileUploadService.deleteFile.mockImplementation(() => {
        deleteOrder.push('delete');
        return Promise.resolve();
      });
      repository.save.mockImplementation(() => {
        deleteOrder.push('save');
        return Promise.resolve(savedUser);
      });

      const result = await service.updateAvatar(1, mockFile, mockI18n);

      expect(deleteOrder).toEqual(['save', 'delete']);
      expect(fileUploadService.deleteFile).toHaveBeenCalledWith(oldAvatarPath);
      expect(userWithAvatar.avatar).toBe(mockUploadResult.url);
      expect(repository.save).toHaveBeenCalledWith(userWithAvatar);
      expect(result.avatar).toBe(mockUploadResult.url);
    });

    it('should still return saved user when old avatar deletion fails after DB save', async () => {
      const oldAvatarPath = 'avatars/old-pic.jpg';
      const userWithAvatar = { ...mockUser, avatar: oldAvatarPath } as User;
      const savedUser = { ...userWithAvatar, avatar: mockUploadResult.url } as User;

      repository.findOneBy.mockResolvedValue(userWithAvatar);
      fileUploadService.getAvatarUploadOptions.mockReturnValue({ maxSizeMB: 2, allowedTypes: [], subDir: 'avatars' });
      fileUploadService.uploadSingle.mockResolvedValue(mockUploadResult);
      fileUploadService.deleteFile.mockRejectedValue(new Error('Disk error'));
      repository.save.mockResolvedValue(savedUser);

      const result = await service.updateAvatar(1, mockFile, mockI18n);

      expect(result.avatar).toBe(mockUploadResult.url);
      expect(fileUploadService.deleteFile).toHaveBeenCalledWith(oldAvatarPath);
    });
  });

  describe('deleteAccount', () => {
    it('should softDelete User and delete UserToken within a transaction', async () => {
      const userId = 1;

      repository.manager.transaction.mockImplementation(async (arg1: unknown, arg2?: unknown) => {
        const cb = (arg2 || arg1) as (manager: typeof mockManager) => Promise<unknown>;
        return cb(mockManager);
      });

      await service.deleteAccount(userId);

      expect(repository.manager.transaction).toHaveBeenCalled();

      expect(mockManager.softDelete).toHaveBeenCalledWith(User, { id: userId });
      expect(mockManager.delete).toHaveBeenCalledWith(UserToken, { userId });
    });

    it('should propagate errors if transaction fails', async () => {
      const userId = 1;
      const error = new Error('Database transaction failed');

      repository.manager.transaction.mockRejectedValue(error);

      await expect(service.deleteAccount(userId)).rejects.toThrow(error);
    });
  });

  describe('deleteAvatar', () => {
    it('should do nothing if user is not found', async () => {
      repository.findOneBy.mockResolvedValue(null);

      await service.deleteAvatar(999);

      expect(repository.findOneBy).toHaveBeenCalledWith({ id: 999 });
      expect(fileUploadService.deleteFile).not.toHaveBeenCalled();
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('should do nothing if user has no avatar', async () => {
      const userWithoutAvatar = { ...mockUser, avatar: null } as User;
      repository.findOneBy.mockResolvedValue(userWithoutAvatar);

      await service.deleteAvatar(1);

      expect(fileUploadService.deleteFile).not.toHaveBeenCalled();
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('should delete file and set user avatar to null', async () => {
      const userWithAvatar = { ...mockUser, avatar: 'avatars/my-pic.jpg' } as User;
      repository.findOneBy.mockResolvedValue(userWithAvatar);
      fileUploadService.deleteFile.mockResolvedValue(undefined);
      repository.save.mockResolvedValue({ ...userWithAvatar, avatar: null } as User);

      await service.deleteAvatar(1);

      expect(fileUploadService.deleteFile).toHaveBeenCalledWith('avatars/my-pic.jpg');
      expect(userWithAvatar.avatar).toBeNull();
      expect(repository.save).toHaveBeenCalledWith(userWithAvatar);
    });
  });
});
