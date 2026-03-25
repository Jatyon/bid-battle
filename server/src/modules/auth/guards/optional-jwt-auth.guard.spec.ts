import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { OptionalJwtAuthGuard } from './optional-jwt-auth.guard';
import { AuthStrategy } from '../enums';
import { createMock } from '@golevelup/ts-jest';

describe('OptionalJwtAuthGuard', () => {
  let guard: OptionalJwtAuthGuard;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [OptionalJwtAuthGuard],
    }).compile();

    guard = module.get<OptionalJwtAuthGuard>(OptionalJwtAuthGuard);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  describe('canActivate', () => {
    let context: ExecutionContext;

    beforeEach(() => {
      context = createMock<ExecutionContext>();
    });

    it('should call super.canActivate from the underlying Passport strategy', async () => {
      const superCanActivateSpy = jest.spyOn(AuthGuard(AuthStrategy.JWT).prototype, 'canActivate').mockReturnValue(true as never);

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(superCanActivateSpy).toHaveBeenCalledWith(context);
    });
  });

  describe('handleRequest', () => {
    it('should return the user object when authentication is successful (user exists)', () => {
      const mockUser = { id: 1, email: 'user@example.com' };

      const result = guard.handleRequest(null, mockUser);

      expect(result).toEqual(mockUser);
    });

    it('should return null when the user object is absent (anonymous request)', () => {
      const resultNull = guard.handleRequest(null, null as unknown);
      expect(resultNull).toBeNull();

      const resultUndefined = guard.handleRequest(null, undefined as unknown);
      expect(resultUndefined).toBeNull();
    });

    it('should return null instead of throwing an exception when an authentication error occurs', () => {
      const error = new Error('Token expired or invalid signature');

      expect(() => guard.handleRequest(error, null as unknown)).not.toThrow();

      const result = guard.handleRequest(error, null as unknown);
      expect(result).toBeNull();
    });

    it('should return the user even if a non-fatal error object is somehow passed by Passport', () => {
      const mockUser = { id: 42, role: 'USER' };
      const warningError = new Error('Non-fatal passport warning');

      const result = guard.handleRequest(warningError, mockUser);

      expect(result).toEqual(mockUser);
    });
  });
});
