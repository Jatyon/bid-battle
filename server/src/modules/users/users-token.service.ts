import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron } from '@nestjs/schedule';
import { User, UserToken } from './entities';
import { UserTokenEnum } from './enums';
import { LessThan, Repository } from 'typeorm';
import { addMilliseconds, addMinutes, isPast } from 'date-fns';
import { I18nContext } from 'nestjs-i18n';
import * as crypto from 'crypto';
import ms from 'ms';

@Injectable()
export class UsersTokenService {
  private readonly logger = new Logger(UsersTokenService.name);

  constructor(
    @InjectRepository(UserToken)
    private tokenRepository: Repository<UserToken>,
  ) {}

  async generateToken(user: User, type: UserTokenEnum, expiresInMinutes: number = 15): Promise<UserToken> {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = addMinutes(new Date(), expiresInMinutes);

    const newToken = this.tokenRepository.create({
      token,
      type,
      user,
      userId: user.id,
      expiresAt,
    });

    return await this.tokenRepository.save(newToken);
  }

  async saveRefreshToken(user: User, jwtToken: string, expiresIn: string): Promise<UserToken> {
    const msValue = (ms as unknown as (v: string) => number | undefined)(expiresIn);

    if (msValue === undefined) throw new Error('Invalid expiresIn string');

    const expiresAt = addMilliseconds(new Date(), msValue);

    const newToken = this.tokenRepository.create({
      token: this.hashToken(jwtToken),
      type: UserTokenEnum.REFRESH_TOKEN,
      user,
      userId: user.id,
      expiresAt,
    });

    return await this.tokenRepository.save(newToken);
  }

  async verifyToken(token: string, type: UserTokenEnum, i18n: I18nContext): Promise<UserToken> {
    const tokenEntity = await this.tokenRepository.findOne({
      where: {
        token,
        type,
        isUsed: false,
      },
      relations: ['user'],
    });

    if (!tokenEntity) throw new BadRequestException(i18n.t('auth.errors.token_not_exist_or_used'));

    if (isPast(tokenEntity.expiresAt)) throw new BadRequestException(i18n.t('auth.errors.token_expired'));

    return tokenEntity;
  }

  async markTokenAsUsed(id: number): Promise<void> {
    await this.tokenRepository.update(id, {
      isUsed: true,
      usedAt: new Date(),
    });
  }

  async deleteExpiredTokens(): Promise<void> {
    await this.tokenRepository.delete({
      expiresAt: LessThan(new Date()),
    });
  }

  async deleteUserTokensByType(userId: number, type: UserTokenEnum): Promise<void> {
    await this.tokenRepository.delete({
      userId,
      type,
    });
  }

  async deleteAllUserTokens(userId: number): Promise<void> {
    await this.tokenRepository.delete({ userId });
  }

  async findActiveRefreshToken(token: string, userId: number): Promise<UserToken | null> {
    const tokenEntity = await this.tokenRepository.findOne({
      where: {
        token: this.hashToken(token),
        type: UserTokenEnum.REFRESH_TOKEN,
        userId,
        isUsed: false,
      },
    });

    if (!tokenEntity) return null;

    if (isPast(tokenEntity.expiresAt)) return null;

    return tokenEntity;
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  @Cron('30 3 * * *')
  async cleanupExpiredTokens() {
    this.logger.log('Starting cleanup of expired tokens...');

    try {
      await this.deleteExpiredTokens();
      this.logger.log('Expired tokens cleanup completed');
    } catch (error) {
      this.logger.error('Failed to cleanup tokens:', error);
    }
  }
}
