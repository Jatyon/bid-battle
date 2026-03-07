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

  async findByUserId(userId: number): Promise<UserPreferences> {
    const preferences = await this.userPreferencesRepository.findOne({
      where: { userId },
    });

    if (!preferences) {
      // Create default preferences if they don't exist
      return this.createDefaultPreferences(userId);
    }

    return preferences;
  }

  async updatePreferences(userId: number, updateDto: UpdateUserPreferencesDto): Promise<UserPreferences> {
    let preferences = await this.userPreferencesRepository.findOne({
      where: { userId },
    });

    if (!preferences) {
      // Create new preferences if they don't exist
      preferences = this.userPreferencesRepository.create({
        userId,
        notifyOnOutbid: updateDto.notifyOnOutbid ?? true,
        notifyOnAuctionEnd: updateDto.notifyOnAuctionEnd ?? true,
      });
    } else {
      // Update existing preferences
      if (updateDto.notifyOnOutbid !== undefined) preferences.notifyOnOutbid = updateDto.notifyOnOutbid;

      if (updateDto.notifyOnAuctionEnd !== undefined) preferences.notifyOnAuctionEnd = updateDto.notifyOnAuctionEnd;
    }

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

  async deletePreferences(userId: number): Promise<void> {
    await this.userPreferencesRepository.delete({ userId });
  }
}
