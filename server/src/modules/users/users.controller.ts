import { ApiTags, ApiOperation, ApiUnauthorizedResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Controller, Get, Put, Body, UseGuards, HttpCode, Delete } from '@nestjs/common';
import { ApiStandardResponse, CurrentUser } from '@core/decorators';
import { MessageResponse } from '@core/models';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { UserPreferencesService } from './user-preferences.service';
import { User, UserPreferences } from './entities';
import { UpdateUserPreferencesDto } from './dto';
import { UsersService } from './users.service';
import { I18n, I18nContext } from 'nestjs-i18n';

@ApiTags('Users')
@ApiBearerAuth('jwt-auth')
@ApiUnauthorizedResponse({ description: 'Authentication required' })
@UseGuards(JwtAuthGuard)
@Controller('/user')
export class UsersController {
  constructor(
    private readonly userPreferencesService: UserPreferencesService,
    private readonly usersService: UsersService,
  ) {}

  @ApiOperation({
    summary: 'Get user preferences',
    description: 'Get current authenticated user notification preferences',
  })
  @ApiStandardResponse(UserPreferences, false)
  @Get('/preferences')
  async getUserPreferences(@CurrentUser() user: User): Promise<UserPreferences> {
    return this.userPreferencesService.findByUserId(user.id);
  }

  @ApiOperation({
    summary: 'Update user preferences',
    description: 'Update current authenticated user notification preferences',
  })
  @ApiStandardResponse(UserPreferences, false)
  @Put('/preferences')
  async updateUserPreferences(@CurrentUser() user: User, @Body() updateDto: UpdateUserPreferencesDto): Promise<UserPreferences> {
    return this.userPreferencesService.updatePreferences(user.id, updateDto);
  }

  @ApiOperation({
    summary: 'Delete account',
    description: 'Soft deletes the currently authenticated user account. Personal data is hidden, but relations (like auctions and bids) are kept for historical integrity.',
  })
  @ApiStandardResponse(MessageResponse, false)
  @HttpCode(200)
  @Delete()
  async deleteAccount(@CurrentUser() user: User, @I18n() i18n: I18nContext): Promise<MessageResponse> {
    await this.usersService.deleteAccount(user.id);
    return {
      message: i18n.t('user.info.account_deleted'),
    };
  }
}
