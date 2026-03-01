import { UserToken, UserTokenEnum } from '@modules/users';
import { User } from '@modules/users/entities/user.entity';

export const createUserFixture = (overrides?: Partial<User>): User => {
  const user = new User();

  Object.assign(user, {
    id: 1,
    email: 'test@example.com',
    password: 'hashed_password',
    firstName: 'John',
    lastName: 'Doe',
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  if (overrides) Object.assign(user, overrides);

  return user;
};

export const createUserTokenFixture = (overrides?: Partial<UserToken>): UserToken => {
  const userToken = new UserToken();

  Object.assign(userToken, {
    id: 1,
    token: 'secret-reset-token',
    type: UserTokenEnum.PASSWORD_RESET,
    userId: 1,
    expiresAt: new Date(),
    isUsed: 0,
    user: createUserFixture(),
    usedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  if (overrides) Object.assign(userToken, overrides);

  return userToken;
};
