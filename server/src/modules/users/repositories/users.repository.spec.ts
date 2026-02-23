import { Test, TestingModule } from '@nestjs/testing';
import { UserRepository } from './users.repository';
import { DataSource } from 'typeorm';

describe('UserRepository', () => {
  let repository: UserRepository;

  const mockQueryBuilder = {
    where: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    getOne: jest.fn(),
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
});
