import { Test, TestingModule } from '@nestjs/testing';
import { UserRepository } from './users.repository';
import { DataSource } from 'typeorm';

describe('UserRepository', () => {
  let repository: UserRepository;

  const mockQueryBuilder = {
    where: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getOne: jest.fn(),
    getMany: jest.fn(),
  };
  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserRepository,
        {
          provide: DataSource,
          useValue: {
            createEntityManager: jest.fn(),
          },
        },
      ],
    }).compile();

    repository = module.get<UserRepository>(UserRepository);
  });

  describe('findOneWithPasswordByEmail', () => {
    it('should call createQueryBuilder with correct parameters', async () => {
      const email = 'test@example.com';
      const mockUser = { id: 1, email, password: 'hashed_password' };

      jest.spyOn(repository, 'createQueryBuilder').mockReturnValue(mockQueryBuilder as unknown as ReturnType<typeof repository.createQueryBuilder>);
      mockQueryBuilder.getOne.mockResolvedValue(mockUser);

      const result = await repository.findOneWithPasswordByEmail(email);

      expect(repository.createQueryBuilder).toHaveBeenCalledWith('user');
      expect(mockQueryBuilder.where).toHaveBeenCalledWith('user.email = :email', { email });
      expect(mockQueryBuilder.addSelect).toHaveBeenCalledWith('user.password');
      expect(result).toEqual(mockUser);
    });
  });

  describe('searchUsers', () => {
    beforeEach(() => {
      jest.spyOn(repository, 'createQueryBuilder').mockReturnValue(mockQueryBuilder as unknown as ReturnType<typeof repository.createQueryBuilder>);
    });

    afterEach(() => {
      jest.clearAllMocks();
    });

    it('should apply where clause and default limit when "q" is provided', async () => {
      const queryDto = { q: 'Jan' };
      const mockUsers = [{ id: 1, firstName: 'Jan' }];
      mockQueryBuilder.getMany.mockResolvedValue(mockUsers);

      const result = await repository.searchUsers(queryDto);

      expect(repository.createQueryBuilder).toHaveBeenCalledWith('user');
      expect(mockQueryBuilder.where).toHaveBeenCalledWith('user.firstName LIKE :search OR user.lastName LIKE :search', { search: '%Jan%' });
      expect(mockQueryBuilder.take).toHaveBeenCalledWith(10);
      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith('user.createdAt', 'DESC');
      expect(mockQueryBuilder.getMany).toHaveBeenCalled();
      expect(result).toEqual(mockUsers);
    });

    it('should NOT apply where clause if "q" is omitted, and use provided limit', async () => {
      const queryDto = { limit: 5 };
      const mockUsers = [
        { id: 1, firstName: 'Anna' },
        { id: 2, firstName: 'Tomek' },
      ];
      mockQueryBuilder.getMany.mockResolvedValue(mockUsers);

      const result = await repository.searchUsers(queryDto);

      expect(repository.createQueryBuilder).toHaveBeenCalledWith('user');
      expect(mockQueryBuilder.where).not.toHaveBeenCalled();
      expect(mockQueryBuilder.take).toHaveBeenCalledWith(5);
      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith('user.createdAt', 'DESC');
      expect(mockQueryBuilder.getMany).toHaveBeenCalled();
      expect(result).toEqual(mockUsers);
    });
  });
});
