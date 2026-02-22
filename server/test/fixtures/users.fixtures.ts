import { User } from '@modules/users/entities/user.entity';

export const createUserFixture = (overrides?: Partial<User>): User =>
  ({
    id: 1,
    email: 'test@example.com',
    password: 'hashed_password',
    firstName: 'John',
    lastName: 'Doe',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as User;
