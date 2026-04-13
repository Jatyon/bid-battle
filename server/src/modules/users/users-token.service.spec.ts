import { BadRequestException, Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { createUserFixture, createUserTokenFixture } from '@test/fixtures/users.fixtures';
import { createMockI18nContext } from '@test/mocks/i18n.mock';
import { UsersTokenService } from './users-token.service';
import { UserToken } from './entities';
import { UserTokenEnum } from './enums';
import { createMock, DeepMocked } from '@golevelup/ts-jest';
import { addMinutes, subMinutes } from 'date-fns';
import { Repository, LessThan } from 'typeorm';

describe('UsersTokenService', () => {
  let service: UsersTokenService;
  let tokenRepository: DeepMocked<Repository<UserToken>>;

  const mockI18nContext = createMockI18nContext();
  const mockUser = createUserFixture();
  const mockDate = new Date('2026-03-01T12:00:00.000Z');

  beforeEach(async () => {
    jest.useFakeTimers().setSystemTime(mockDate);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersTokenService,
        {
          provide: getRepositoryToken(UserToken),
          useValue: createMock<Repository<UserToken>>(),
        },
      ],
    }).compile();

    service = module.get<UsersTokenService>(UsersTokenService);
    tokenRepository = module.get(getRepositoryToken(UserToken));

    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  describe('generateToken', () => {
    it('should generate a token, save it and return the entity', async () => {
      const expiresInMinutes = 15;
      const expectedExpiresAt = addMinutes(mockDate, expiresInMinutes);

      const createdToken = { id: 1, token: 'mocked-hash' } as UserToken;
      tokenRepository.create.mockReturnValue(createdToken);
      tokenRepository.save.mockResolvedValue(createdToken);

      const result = await service.generateToken(mockUser, UserTokenEnum.PASSWORD_RESET, expiresInMinutes);

      expect(tokenRepository.create).toHaveBeenCalledWith({
        token: expect.any(String) as unknown,
        type: UserTokenEnum.PASSWORD_RESET,
        user: mockUser,
        userId: mockUser.id,
        expiresAt: expectedExpiresAt,
      });
      expect(tokenRepository.save).toHaveBeenCalledWith(createdToken);
      expect(result).toEqual(createdToken);
    });

    it('should use default expiresInMinutes of 15 when not provided', async () => {
      const expectedExpiresAt = addMinutes(mockDate, 15);
      const createdToken = createUserTokenFixture();

      tokenRepository.create.mockReturnValue(createdToken);
      tokenRepository.save.mockResolvedValue(createdToken);

      await service.generateToken(mockUser, UserTokenEnum.PASSWORD_RESET);

      expect(tokenRepository.create).toHaveBeenCalledWith(expect.objectContaining({ expiresAt: expectedExpiresAt }));
    });
  });

  describe('saveRefreshToken', () => {
    it('should hash the jwt token and save it with computed expiresAt', async () => {
      const jwtToken = 'some.jwt.token';
      const expiresIn = '7d';
      const createdToken = createUserTokenFixture({ type: UserTokenEnum.REFRESH_TOKEN });

      tokenRepository.create.mockReturnValue(createdToken);
      tokenRepository.save.mockResolvedValue(createdToken);

      const result = await service.saveRefreshToken(mockUser, jwtToken, expiresIn);

      expect(tokenRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: UserTokenEnum.REFRESH_TOKEN,
          user: mockUser,
          userId: mockUser.id,
          token: expect.any(String) as string,
          expiresAt: expect.any(Date) as Date,
        }),
      );
      expect(tokenRepository.save).toHaveBeenCalledWith(createdToken);
      expect(result).toEqual(createdToken);
    });

    it('should throw when expiresIn string is invalid', async () => {
      await expect(service.saveRefreshToken(mockUser, 'token', 'invalid')).rejects.toThrow('Invalid expiresIn string');

      expect(tokenRepository.create).not.toHaveBeenCalled();
    });

    it('should store a hash of the token, not the raw value', async () => {
      const jwtToken = 'raw-jwt-token';
      const createdToken = createUserTokenFixture({ type: UserTokenEnum.REFRESH_TOKEN });

      tokenRepository.create.mockReturnValue(createdToken);
      tokenRepository.save.mockResolvedValue(createdToken);

      await service.saveRefreshToken(mockUser, jwtToken, '7d');

      const createCall = tokenRepository.create.mock.calls[0][0] as Partial<UserToken>;
      expect(createCall.token).not.toBe(jwtToken);
      expect(createCall.token).toHaveLength(64);
    });
  });

  describe('verifyToken', () => {
    const validTokenString = 'valid-token';

    it('should throw BadRequestException if token is not found or already used', async () => {
      tokenRepository.findOne.mockResolvedValue(null);

      await expect(service.verifyToken(validTokenString, UserTokenEnum.PASSWORD_RESET, mockI18nContext)).rejects.toThrow(BadRequestException);

      expect(tokenRepository.findOne).toHaveBeenCalledWith({
        where: { token: validTokenString, type: UserTokenEnum.PASSWORD_RESET, isUsed: false },
        relations: ['user'],
      });
    });

    it('should throw BadRequestException if token is expired', async () => {
      const expiredToken = {
        id: 1,
        expiresAt: subMinutes(mockDate, 10),
      } as UserToken;

      tokenRepository.findOne.mockResolvedValue(expiredToken);

      await expect(service.verifyToken(validTokenString, UserTokenEnum.PASSWORD_RESET, mockI18nContext)).rejects.toThrow(BadRequestException);
    });

    it('should return token entity if token is valid and not expired', async () => {
      const validToken = {
        id: 1,
        expiresAt: addMinutes(mockDate, 10),
      } as UserToken;

      tokenRepository.findOne.mockResolvedValue(validToken);

      const result = await service.verifyToken(validTokenString, UserTokenEnum.PASSWORD_RESET, mockI18nContext);

      expect(result).toEqual(validToken);
    });
  });

  describe('markTokenAsUsed', () => {
    it('should update token isUsed status and usedAt date', async () => {
      const tokenEntity = createUserTokenFixture({ id: 1 });
      tokenRepository.findOneBy.mockResolvedValue(tokenEntity);
      tokenRepository.save.mockResolvedValue({ ...tokenEntity, isUsed: true, usedAt: mockDate });

      await service.markTokenAsUsed(1);

      expect(tokenRepository.findOneBy).toHaveBeenCalledWith({ id: 1 });
      expect(tokenRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          isUsed: true,
          usedAt: mockDate,
        }),
      );
    });

    it('should do nothing when token is not found', async () => {
      tokenRepository.findOneBy.mockResolvedValue(null);

      await service.markTokenAsUsed(999);

      expect(tokenRepository.findOneBy).toHaveBeenCalledWith({ id: 999 });
      expect(tokenRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('deleteExpiredTokens', () => {
    it('should delete tokens where expiresAt is less than current date', async () => {
      await service.deleteExpiredTokens();

      expect(tokenRepository.delete).toHaveBeenCalledWith({
        expiresAt: LessThan(mockDate),
      });
    });
  });

  describe('deleteUserTokensByType', () => {
    it('should delete tokens for specific user and type', async () => {
      await service.deleteUserTokensByType(mockUser.id, UserTokenEnum.PASSWORD_RESET);

      expect(tokenRepository.delete).toHaveBeenCalledWith({
        userId: mockUser.id,
        type: UserTokenEnum.PASSWORD_RESET,
      });
    });
  });

  describe('deleteAllUserTokens', () => {
    it('should delete all tokens for a specific user', async () => {
      await service.deleteAllUserTokens(mockUser.id);

      expect(tokenRepository.delete).toHaveBeenCalledWith({
        userId: mockUser.id,
      });
    });
  });

  describe('findActiveRefreshToken', () => {
    it('should return null when token is not found', async () => {
      tokenRepository.findOne.mockResolvedValue(null);

      const result = await service.findActiveRefreshToken('raw-token', mockUser.id);

      expect(result).toBeNull();
      expect(tokenRepository.findOne).toHaveBeenCalledWith({
        where: {
          token: expect.any(String) as string,
          type: UserTokenEnum.REFRESH_TOKEN,
          userId: mockUser.id,
        },
      });
    });

    it('should return null when token is found but expired', async () => {
      const expiredToken = createUserTokenFixture({
        type: UserTokenEnum.REFRESH_TOKEN,
        expiresAt: subMinutes(mockDate, 5),
      });
      tokenRepository.findOne.mockResolvedValue(expiredToken);

      const result = await service.findActiveRefreshToken('raw-token', mockUser.id);

      expect(result).toBeNull();
    });

    it('should return token entity when token is valid and not expired', async () => {
      const validToken = createUserTokenFixture({
        type: UserTokenEnum.REFRESH_TOKEN,
        expiresAt: addMinutes(mockDate, 60),
      });
      tokenRepository.findOne.mockResolvedValue(validToken);

      const result = await service.findActiveRefreshToken('raw-token', mockUser.id);

      expect(result).toEqual(validToken);
    });

    it('should search by hashed token, not raw value', async () => {
      const rawToken = 'raw-jwt-token';
      tokenRepository.findOne.mockResolvedValue(null);

      await service.findActiveRefreshToken(rawToken, mockUser.id);

      const callArg = tokenRepository.findOne.mock.calls[0][0] as { where: Partial<UserToken> };
      expect(callArg.where.token).not.toBe(rawToken);
      expect(callArg.where.token).toHaveLength(64);
    });
  });

  describe('revokeAllRefreshTokens', () => {
    it('should mark all active refresh tokens of a user as used', async () => {
      await service.revokeAllRefreshTokens(mockUser.id);

      expect(tokenRepository.update).toHaveBeenCalledWith({ userId: mockUser.id, type: UserTokenEnum.REFRESH_TOKEN, isUsed: false }, { isUsed: true, usedAt: mockDate });
    });
  });

  describe('cleanupExpiredTokens (Cron)', () => {
    it('should execute deleteExpiredTokens and log success', async () => {
      jest.spyOn(service, 'deleteExpiredTokens').mockResolvedValue(undefined);

      await service.cleanupExpiredTokens();

      expect(service.deleteExpiredTokens).toHaveBeenCalled();
      expect(Logger.prototype.log).toHaveBeenCalledWith('Starting cleanup of expired tokens...');
      expect(Logger.prototype.log).toHaveBeenCalledWith('Expired tokens cleanup completed');
    });

    it('should log error if deleteExpiredTokens fails', async () => {
      const error = new Error('DB Error');
      jest.spyOn(service, 'deleteExpiredTokens').mockRejectedValue(error);

      await service.cleanupExpiredTokens();

      expect(service.deleteExpiredTokens).toHaveBeenCalled();
      expect(Logger.prototype.error).toHaveBeenCalledWith('Failed to cleanup tokens:', error);
    });
  });
});
