import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UpdateUserPreferencesDto } from './dto';
import { UserPreferences } from './entities';

@Injectable()
export class UserPreferencesService {
  constructor(
    @InjectRepository(UserPreferences)
    private readonly userPreferencesRepository: Repository<UserPreferences>,
  ) {}

  async findByUserId(userId: number): Promise<UserPreferences | null> {
    return this.userPreferencesRepository.findOne({
      where: { userId },
    });
  }

  async findOrCreateByUserId(userId: number): Promise<UserPreferences> {
    const existing = await this.userPreferencesRepository.findOne({
      where: { userId },
    });

    if (existing) return existing;

    return this.createDefaultPreferences(userId);
  }

  async updatePreferences(userId: number, updateDto: UpdateUserPreferencesDto): Promise<UserPreferences> {
    const preferences = await this.findOrCreateByUserId(userId);

    preferences.lang = updateDto.lang;
    preferences.notifyOnOutbid = updateDto.notifyOnOutbid;
    preferences.notifyOnAuctionEnd = updateDto.notifyOnAuctionEnd;

    return this.userPreferencesRepository.save(preferences);
  }

  async createDefaultPreferences(userId: number): Promise<UserPreferences> {
    const preferences = this.userPreferencesRepository.create({
      userId,
      notifyOnOutbid: true,
      notifyOnAuctionEnd: true,
    });

    return this.userPreferencesRepository.save(preferences);
  }
}
