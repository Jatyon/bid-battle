import { Language } from '@core/enums/language.enum';
import { User, UserPreferences, UserToken, UserTokenEnum } from '@modules/users';

export const createUserFixture = (overrides?: Partial<User>): User => {
  const user = new User();

  Object.assign(user, {
    id: 1,
    email: 'test@example.com',
    password: 'hashed_password',
    firstName: 'John',
    lastName: 'Doe',
    isEmailVerified: true,
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

export const createUserPreferencesFixture = (overrides?: Partial<UserPreferences>): UserPreferences => {
  const userPreferences = new UserPreferences();

  Object.assign(userPreferences, { userId: 1, lang: Language.EN, notifyOnOutbid: true, notifyOnAuctionEnd: true, ...overrides });

  return userPreferences;
};
