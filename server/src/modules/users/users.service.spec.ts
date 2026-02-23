import { Test, TestingModule } from '@nestjs/testing';
import { createUserFixture } from '@test/fixtures/users.fixtures';
import { UserRepository } from './repositories/users.repository';
import { UsersService } from './users.service';
import { createMock, DeepMocked } from '@golevelup/ts-jest';
import { UpdateResult } from 'typeorm';

describe('UsersService', () => {
  let service: UsersService;
  let repository: DeepMocked<UserRepository>;

  const mockUser = createUserFixture();

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
});
