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
    return (await this.userPreferencesRepository.findOne({
      where: { userId },
    })) as UserPreferences;
  }

  async updatePreferences(userId: number, updateDto: UpdateUserPreferencesDto): Promise<UserPreferences> {
    const preferences = (await this.userPreferencesRepository.findOne({
      where: { userId },
    })) as UserPreferences;

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
