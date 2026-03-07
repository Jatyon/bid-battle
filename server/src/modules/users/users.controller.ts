import { ApiTags, ApiOperation, ApiUnauthorizedResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Controller, Get, Put, Body, UseGuards } from '@nestjs/common';
import { ApiStandardResponse } from '@core/decorators/api-standard-response.decorator';
import { CurrentUser } from '@core/decorators/current-user.decorator';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { UserPreferencesService } from './user-preferences.service';
import { User, UserPreferences } from './entities';
import { UpdateUserPreferencesDto } from './dto';

@ApiTags('Users')
@ApiBearerAuth('jwt-auth')
@ApiUnauthorizedResponse({ description: 'Authentication required' })
@UseGuards(JwtAuthGuard)
@Controller('/user')
export class UsersController {
  constructor(private readonly userPreferencesService: UserPreferencesService) {}

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
}
