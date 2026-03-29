import { Test, TestingModule } from '@nestjs/testing';
import { createUserFixture } from '@test/fixtures/users.fixtures';
import { UserRepository } from './repositories/users.repository';
import { UsersService } from './users.service';
import { User, UserToken } from './entities';
import { createMock, DeepMocked } from '@golevelup/ts-jest';
import { UpdateResult } from 'typeorm';

describe('UsersService', () => {
  let service: UsersService;
  let repository: DeepMocked<UserRepository>;

  const mockUser = createUserFixture();

  const mockManager = {
    softDelete: jest.fn(),
    delete: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: UserRepository,
          useValue: createMock<UserRepository>(),
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    repository = module.get(UserRepository);
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
});
