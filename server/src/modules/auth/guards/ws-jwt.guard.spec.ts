import { ExecutionContext } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { WsException } from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { createMock, DeepMocked } from '@golevelup/ts-jest';
import { I18nService } from 'nestjs-i18n';
import { WsJwtGuard } from './ws-jwt.guard';
import { AuthService } from '../auth.service';
import { IAuthJwt, IAuthJwtPayload, IAuthSocket } from '../interfaces';

describe('WsJwtGuard', () => {
  let guard: WsJwtGuard;
  let jwtService: DeepMocked<JwtService>;
  let authService: DeepMocked<AuthService>;

  const mockPayload: IAuthJwt = { sub: 1, email: 'test@example.com', iat: 123, exp: 456 };
  const mockUserPayload: IAuthJwtPayload = { sub: 1, email: 'test@example.com' };

  /** Helper do tworzenia mocka socketu z określonym nagłówkiem autoryzacyjnym */
  const createMockSocket = (authHeader?: string | null, user?: IAuthJwtPayload): DeepMocked<IAuthSocket> => {
    return createMock<IAuthSocket>({
      handshake: {
        headers: {
          ...(authHeader && { authorization: authHeader }),
        },
      },
      data: { user },
    });
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WsJwtGuard,
        { provide: JwtService, useValue: createMock<JwtService>() },
        { provide: AuthService, useValue: createMock<AuthService>() },
        {
          provide: I18nService,
          useValue: createMock<I18nService>({
            t: jest.fn().mockImplementation((key: string) => key),
            translate: jest.fn().mockImplementation((key: string) => Promise.resolve(key)),
          }),
        },
      ],
    }).compile();

    guard = module.get<WsJwtGuard>(WsJwtGuard);
    jwtService = module.get(JwtService);
    authService = module.get(AuthService);
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  describe('canActivate', () => {
    it('should return true immediately if client.data.user already exists', async () => {
      const client = createMockSocket('Bearer valid-token', mockUserPayload);
      const context = createMock<ExecutionContext>({
        switchToWs: () => ({ getClient: () => client }),
      });

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(jwtService.verify).not.toHaveBeenCalled();
    });

    it('should call validateClient and return true if client.data.user does not exist', async () => {
      const client = createMockSocket('Bearer valid-token');
      const context = createMock<ExecutionContext>({
        switchToWs: () => ({ getClient: () => client }),
      });

      jest.spyOn(guard, 'validateClient').mockResolvedValue(mockUserPayload);

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(guard.validateClient).toHaveBeenCalledWith(client);
    });

    it('should propagate WsException if validateClient fails', async () => {
      const client = createMockSocket();
      const context = createMock<ExecutionContext>({
        switchToWs: () => ({ getClient: () => client }),
      });

      jest.spyOn(guard, 'validateClient').mockRejectedValue(new WsException('Error'));

      await expect(guard.canActivate(context)).rejects.toThrow(WsException);
    });
  });

  describe('validateClient', () => {
    it('should throw WsException when token is missing', async () => {
      const client = createMockSocket(null);

      await expect(guard.validateClient(client)).rejects.toThrow(WsException);
      expect(jwtService.verify).not.toHaveBeenCalled();
    });

    it('should throw WsException when token format is invalid (not Bearer)', async () => {
      const client = createMockSocket('Basic some-token');

      await expect(guard.validateClient(client)).rejects.toThrow(WsException);
    });

    it('should throw WsException when token verification fails', async () => {
      const client = createMockSocket('Bearer invalid-token');
      jwtService.verify.mockImplementation(() => {
        throw new Error('Verification failed');
      });

      await expect(guard.validateClient(client)).rejects.toThrow(WsException);
      expect(authService.validateJwtUser).not.toHaveBeenCalled();
    });

    it('should throw WsException when authService user validation returns null', async () => {
      const client = createMockSocket('Bearer valid-token');
      jwtService.verify.mockReturnValue(mockPayload);
      authService.validateJwtUser.mockResolvedValue(null as never);

      await expect(guard.validateClient(client)).rejects.toThrow(WsException);
    });

    it('should attach payload to client.data.user and return it on success', async () => {
      const client = createMockSocket('Bearer valid-token');
      jwtService.verify.mockReturnValue(mockPayload);
      authService.validateJwtUser.mockResolvedValue(mockUserPayload as never);

      const result = await guard.validateClient(client);

      expect(result).toEqual(mockPayload);
      expect(client.data.user).toEqual(mockPayload);
    });
  });

  describe('validateOptional', () => {
    it('should return null when token is missing without throwing error', async () => {
      const client = createMockSocket();

      const result = await guard.validateOptional(client);

      expect(result).toBeNull();
      expect(client.data.user).toBeUndefined();
    });

    it('should return null when token verification fails without throwing error', async () => {
      const client = createMockSocket('Bearer invalid-token');
      jwtService.verify.mockImplementation(() => {
        throw new Error('Verification failed');
      });

      const result = await guard.validateOptional(client);

      expect(result).toBeNull();
    });

    it('should return null when authService user validation returns null', async () => {
      const client = createMockSocket('Bearer valid-token');
      jwtService.verify.mockReturnValue(mockPayload);
      authService.validateJwtUser.mockResolvedValue(null as never);

      const result = await guard.validateOptional(client);

      expect(result).toBeNull();
    });

    it('should attach payload to client.data.user and return it on success', async () => {
      const client = createMockSocket('Bearer valid-token');
      jwtService.verify.mockReturnValue(mockPayload);
      authService.validateJwtUser.mockResolvedValue(mockUserPayload as never);

      const result = await guard.validateOptional(client);

      expect(result).toEqual(mockPayload);
      expect(client.data.user).toEqual(mockPayload);
    });
  });

  describe('revalidateSocket', () => {
    it('should throw WsException and clear client.data.user when token is missing', async () => {
      const client = createMockSocket(null, mockUserPayload);

      await expect(guard.revalidateSocket(client)).rejects.toThrow(WsException);
      expect(client.data.user).toBeUndefined();
    });

    it('should throw WsException and clear client.data.user when verifyAsync fails', async () => {
      const client = createMockSocket('Bearer invalid-token', mockUserPayload);
      jwtService.verifyAsync.mockRejectedValue(new Error('Expired'));

      await expect(guard.revalidateSocket(client)).rejects.toThrow(WsException);
      expect(client.data.user).toBeUndefined();
    });

    it('should throw WsException and clear client.data.user when authService user validation returns null', async () => {
      const client = createMockSocket('Bearer valid-token', mockUserPayload);
      jwtService.verifyAsync.mockResolvedValue(mockPayload);
      authService.validateJwtUser.mockResolvedValue(null as never);

      await expect(guard.revalidateSocket(client)).rejects.toThrow(WsException);
      expect(client.data.user).toBeUndefined();
    });

    it('should attach payload to client.data.user and return it on successful deep validation', async () => {
      const client = createMockSocket('Bearer valid-token');
      jwtService.verifyAsync.mockResolvedValue(mockPayload);
      authService.validateJwtUser.mockResolvedValue(mockUserPayload as never);

      const result = await guard.revalidateSocket(client);

      expect(result).toEqual(mockPayload);
      expect(client.data.user).toEqual(mockPayload);
    });
  });
});
