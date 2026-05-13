import { User } from '@core/models';

let _userId = 1;

export const createUserFixture = (overrides?: Partial<User>): User => ({
  id: _userId++,
  email: 'test@example.com',
  firstName: 'Jan',
  lastName: 'Kowalski',
  ...overrides,
});
