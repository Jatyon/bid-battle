import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard';
import { createMock } from '@golevelup/ts-jest';

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let reflector: Reflector;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtAuthGuard,
        {
          provide: Reflector,
          useValue: {
            getAllAndOverride: jest.fn(),
          },
        },
      ],
    }).compile();

    guard = module.get<JwtAuthGuard>(JwtAuthGuard);
    reflector = module.get<Reflector>(Reflector);
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  describe('canActivate', () => {
    let context: ExecutionContext;

    beforeEach(() => {
      context = createMock<ExecutionContext>();
    });

    it('should return true if the route is marked as public', async () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(reflector.getAllAndOverride).toHaveBeenCalled();
    });

    it('should call super.canActivate if the route is not public', async () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);

      const superCanActivateSpy = jest.spyOn(AuthGuard('jwt').prototype, 'canActivate').mockReturnValue(true);

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(superCanActivateSpy).toHaveBeenCalledWith(context);
    });
  });

  describe('handleRequest', () => {
    it('should return the user if there is no error and user exists', () => {
      const mockUser = { id: 1, email: 'test@test.com' };
      const result = guard.handleRequest(null, mockUser);

      expect(result).toEqual(mockUser);
    });

    it('should throw UnauthorizedException if there is an error', () => {
      const error = new Error('Custom error');
      expect(() => guard.handleRequest(error, null)).toThrow(error);
    });

    it('should throw UnauthorizedException if user is not present', () => {
      expect(() => guard.handleRequest(null, null)).toThrow(UnauthorizedException);
    });
  });
});
