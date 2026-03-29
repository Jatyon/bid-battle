import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiNotFoundResponse } from '@nestjs/swagger';
import { ApiStandardResponse, Public } from '@core/decorators';
import { PublicUserProfileResponse } from './dto';
import { UsersService } from './users.service';
import { I18n, I18nContext } from 'nestjs-i18n';

@ApiTags('Users')
@Controller('/users')
export class PublicUsersController {
  constructor(private readonly usersService: UsersService) {}

  @ApiOperation({
    summary: 'Get public seller profile',
    description: 'Fetches anonymized user profile information (avatar, first name, last name initial, join date).',
  })
  @ApiStandardResponse(PublicUserProfileResponse, false)
  @ApiNotFoundResponse({ description: 'User not found' })
  @Public()
  @Get('/:id')
  async getPublicProfile(@Param('id', ParseIntPipe) id: number, @I18n() i18n: I18nContext): Promise<PublicUserProfileResponse> {
    return this.usersService.getPublicProfile(id, i18n);
  }
}
