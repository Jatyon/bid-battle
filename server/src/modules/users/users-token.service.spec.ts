import { BadRequestException, Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { createUserFixture } from '@test/fixtures/users.fixtures';
import { createMockI18nContext } from '@test/mocks/i18n.mock';
import { UsersTokenService } from './users-token.service';
import { UserToken } from './entities';
import { UserTokenEnum } from './enums';
import { createMock } from '@golevelup/ts-jest';
import { addMinutes, subMinutes } from 'date-fns';
import { Repository, LessThan } from 'typeorm';
import * as crypto from 'crypto';

jest.mock('crypto', () => ({
  randomBytes: jest.fn(),
}));

describe('UsersTokenService', () => {
  let service: UsersTokenService;
  let tokenRepository: jest.Mocked<Repository<UserToken>>;

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

      jest.spyOn(crypto, 'randomBytes').mockImplementation(() => Buffer.from('mockedbytes'));

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
      await service.markTokenAsUsed(1);

      expect(tokenRepository.update).toHaveBeenCalledWith(1, {
        isUsed: true,
        usedAt: mockDate,
      });
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
