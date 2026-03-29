import { Test, TestingModule } from '@nestjs/testing';
import { PublicUsersController } from './public-users.controller';
import { PublicUserProfileResponse } from './dto';
import { UsersService } from './users.service';
import { User } from './entities/user.entity';
import { createMock, DeepMocked } from '@golevelup/ts-jest';
import { I18nContext } from 'nestjs-i18n';

describe('PublicUsersController', () => {
  let controller: PublicUsersController;
  let usersService: DeepMocked<UsersService>;

  const mockI18n = createMock<I18nContext>();

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PublicUsersController],
      providers: [
        {
          provide: UsersService,
          useValue: createMock<UsersService>(),
        },
      ],
    }).compile();

    controller = module.get<PublicUsersController>(PublicUsersController);
    usersService = module.get(UsersService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getPublicProfile', () => {
    it('should call usersService.getPublicProfile and return the result', async () => {
      const mockUser = { id: 1, firstName: 'John', lastName: 'D.', createdAt: new Date() } as User;
      const expectedResponse = new PublicUserProfileResponse(mockUser);

      usersService.getPublicProfile.mockResolvedValue(expectedResponse);

      const result = await controller.getPublicProfile(1, mockI18n);

      expect(usersService.getPublicProfile).toHaveBeenCalledWith(1, mockI18n);
      expect(result).toEqual(expectedResponse);
    });

    it('should propagate errors from the service', async () => {
      const error = new Error('Not found');
      usersService.getPublicProfile.mockRejectedValue(error);

      await expect(controller.getPublicProfile(999, mockI18n)).rejects.toThrow(error);
      expect(usersService.getPublicProfile).toHaveBeenCalledWith(999, mockI18n);
    });
  });
});
