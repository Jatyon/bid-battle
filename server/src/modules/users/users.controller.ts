import { ApiTags, ApiOperation, ApiUnauthorizedResponse, ApiBearerAuth, ApiConsumes, ApiBody, ApiPayloadTooLargeResponse } from '@nestjs/swagger';
import { Controller, Get, Put, Body, UseGuards, HttpCode, Delete, ClassSerializerInterceptor, UseInterceptors, Patch, Post, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiStandardResponse, CurrentUser } from '@core/decorators';
import { MessageResponse } from '@core/models';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { UserPreferencesService } from './user-preferences.service';
import { UpdateProfileDto, UpdateUserPreferencesDto } from './dto';
import { User, UserPreferences } from './entities';
import { UsersService } from './users.service';
import { I18n, I18nContext } from 'nestjs-i18n';

@ApiTags('User')
@ApiBearerAuth('jwt-auth')
@ApiUnauthorizedResponse({ description: 'Authentication required' })
@UseGuards(JwtAuthGuard)
@UseInterceptors(ClassSerializerInterceptor)
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
    return this.userPreferencesService.findOrCreateByUserId(user.id);
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
    summary: 'Update user profile',
    description: 'Update current authenticated user basic information',
  })
  @ApiStandardResponse(User, false)
  @Patch('/profile')
  async updateProfile(@CurrentUser() user: User, @Body() updateDto: UpdateProfileDto, @I18n() i18n: I18nContext): Promise<User> {
    return this.usersService.updateProfile(user.id, updateDto, i18n);
  }

  @ApiOperation({
    summary: 'Upload user avatar',
    description: 'Upload a new profile picture. Supported formats: jpg, png.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Image file (jpg, png)',
        },
      },
    },
  })
  @ApiStandardResponse(User, false)
  @ApiPayloadTooLargeResponse({ description: 'Payload Too Large: uploaded file is too large' })
  @Post('/avatar')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('file'))
  async uploadAvatar(@CurrentUser() user: User, @UploadedFile() file: Express.Multer.File, @I18n() i18n: I18nContext): Promise<User> {
    return this.usersService.updateAvatar(user.id, file, i18n);
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

  @ApiOperation({
    summary: 'Delete user avatar',
    description: 'Removes current profile picture and reverts to default',
  })
  @ApiStandardResponse(MessageResponse, false)
  @Delete('/avatar')
  async deleteAvatar(@CurrentUser() user: User, @I18n() i18n: I18nContext): Promise<MessageResponse> {
    await this.usersService.deleteAvatar(user.id);
    return {
      message: i18n.t('user.info.avatar_deleted'),
    };
  }
}
