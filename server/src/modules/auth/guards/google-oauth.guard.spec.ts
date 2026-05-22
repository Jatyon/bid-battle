import { ExecutionContext } from '@nestjs/common';
import { createMock } from '@golevelup/ts-jest';
import { GoogleOAuthGuard } from './google-oauth.guard';

describe('GoogleOAuthGuard', () => {
  let guard: GoogleOAuthGuard;
  let mockRequest: Record<string, any>;
  let mockContext: ExecutionContext;
  let superCanActivateSpy: jest.SpyInstance;

  beforeEach(() => {
    guard = new GoogleOAuthGuard();

    mockRequest = {};

    mockContext = createMock<ExecutionContext>({
      switchToHttp: () => ({
        getRequest: () => mockRequest,
      }),
    });
    superCanActivateSpy = jest.spyOn(Object.getPrototypeOf(GoogleOAuthGuard.prototype), 'canActivate');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('handleRequest', () => {
    it('should return user if no error occurs and user is present', () => {
      const mockUser = { id: 1, email: 'test@example.com' };

      const result = guard.handleRequest(null, mockUser);

      expect(result).toBe(mockUser);
    });

    it('should throw the provided error if err is present', () => {
      const customError = new Error('Verification failed');

      expect(() => {
        guard.handleRequest(customError, null);
      }).toThrow(customError);
    });

    it('should throw a default error if user is missing and no err is provided', () => {
      expect(() => {
        guard.handleRequest(null, null);
      }).toThrow(new Error('OAuth authentication failed'));
    });

    it('should throw the provided error even if user is present (err takes precedence)', () => {
      const customError = new Error('Some passport internal error');
      const mockUser = { id: 1 };

      expect(() => {
        guard.handleRequest(customError, mockUser);
      }).toThrow(customError);
    });
  });

  describe('canActivate', () => {
    it('should return true and not modify request if super.canActivate resolves to true', async () => {
      superCanActivateSpy.mockResolvedValue(true);

      const result = await guard.canActivate(mockContext);

      expect(superCanActivateSpy).toHaveBeenCalledWith(mockContext);
      expect(result).toBe(true);

      expect(mockRequest.authError).toBeUndefined();
    });

    it('should catch error, attach it to request.authError, and return true if super.canActivate throws', async () => {
      const expectedError = new Error('OAuth authentication failed');
      superCanActivateSpy.mockRejectedValue(expectedError);

      const result = await guard.canActivate(mockContext);

      expect(superCanActivateSpy).toHaveBeenCalledWith(mockContext);

      expect(result).toBe(true);

      expect(mockRequest.authError).toBe(expectedError);
    });
  });
});
