import { AppConfigService } from '@config/config.service';
import { IAuthJwt } from '../interfaces/auth-jwt.interface';
import { AuthJwtStrategy } from './auth-jwt.strategy';
import { AuthService } from '../auth.service';
import { I18nService } from 'nestjs-i18n';

describe('AuthJwtStrategy', () => {
  let strategy: AuthJwtStrategy;
  let mockAuthService: jest.Mocked<Partial<AuthService>>;
  let mockConfigService: Partial<AppConfigService>;
  let mockI18nService: Partial<I18nService>;

  beforeEach(() => {
    mockConfigService = {
      jwt: {
        secret: 'super-secret-test-key',
      },
    } as unknown as Partial<AppConfigService>;

    mockAuthService = {
      validateJwtUser: jest.fn(),
    };

    mockI18nService = {};

    strategy = new AuthJwtStrategy(mockConfigService as AppConfigService, mockAuthService as AuthService, mockI18nService as I18nService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(strategy).toBeDefined();
  });

  describe('validate', () => {
    it('should call authService.validateJwtUser and return the user', async () => {
      const mockPayload = {
        userId: 1,
        email: 'test@example.com',
      } as unknown as IAuthJwt;

      const mockUser = { id: 1, email: 'test@example.com' };

      (mockAuthService.validateJwtUser as unknown as jest.Mock).mockResolvedValueOnce(mockUser);

      const result = (await strategy.validate(mockPayload)) as unknown;

      expect(mockAuthService.validateJwtUser).toHaveBeenCalledWith(mockPayload, mockI18nService);

      expect(result).toEqual(mockUser);
    });

    it('should throw an error if authService.validateJwtUser throws', async () => {
      const mockPayload = {
        payload: { userId: 999 },
      } as unknown as IAuthJwt;

      const error = new Error('Unauthorized');

      (mockAuthService.validateJwtUser as unknown as jest.Mock).mockRejectedValueOnce(error);

      await expect(strategy.validate(mockPayload)).rejects.toThrow(error);
    });
  });
});
