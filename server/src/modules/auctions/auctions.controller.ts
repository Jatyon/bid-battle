import { Controller, Post, Body, UseGuards, HttpCode, UseInterceptors, UploadedFiles, BadRequestException, Get, Query, Param, ParseIntPipe, Delete, Patch } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { ApiStandardResponse, CurrentUser, Public } from '@core/decorators';
import { Paginator, PaginatorResponse } from '@core/models';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { User } from '@modules/users';
import { FileUploadService } from '@shared/file-upload';
import { AuctionDetailResponse, AuctionResponse, CreateAuctionDto, UploadAuctionImagesDto, UploadedFileDto, UpdateAuctionDto } from './dto';
import { AuctionsService } from './auctions.service';
import { I18n, I18nContext } from 'nestjs-i18n';

@ApiTags('Auctions')
@Controller('auctions')
export class AuctionsController {
  constructor(
    private readonly auctionsService: AuctionsService,
    private readonly fileUploadService: FileUploadService,
  ) {}

  @ApiOperation({
    summary: 'Upload auction images',
    description: 'Upload multiple images for an auction. Returns array of uploaded file URLs.',
  })
  @ApiStandardResponse(UploadedFileDto, true)
  @ApiBearerAuth('jwt-auth')
  @ApiConsumes('multipart/form-data')
  @HttpCode(200)
  @Post('/upload-images')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileFieldsInterceptor([{ name: 'images', maxCount: 10 }]))
  async uploadAuctionImages(
    @UploadedFiles() files: { images?: Express.Multer.File[] },
    @Body() uploadDto: UploadAuctionImagesDto,
    @I18n() i18n: I18nContext,
  ): Promise<UploadedFileDto[]> {
    if (!files?.images || files.images.length === 0) throw new BadRequestException(i18n.t('error.validation.file.no_file_provided'));

    const uploadedFiles = await this.fileUploadService.uploadMultiple(files.images, this.fileUploadService.getAuctionImageUploadOptions(), i18n);

    return uploadedFiles.map((file) => new UploadedFileDto(file));
  }

  @ApiOperation({
    summary: 'Create a new auction',
    description: 'Create a new auction item. Requires authentication. End time must be at least 1 hour in the future.',
  })
  @ApiStandardResponse(AuctionResponse, false)
  @ApiBearerAuth('jwt-auth')
  @HttpCode(200)
  @Post()
  @UseGuards(JwtAuthGuard)
  async createAuction(@Body() createAuctionDto: CreateAuctionDto, @CurrentUser() user: User): Promise<AuctionResponse> {
    return this.auctionsService.createAuction(createAuctionDto, user.id);
  }

  @ApiOperation({
    summary: 'Get active auctions',
    description: 'Get list of active auctions with pagination. Results are cached for faster response.',
  })
  @ApiStandardResponse(PaginatorResponse, false, AuctionResponse)
  @Public()
  @Get()
  async getAuctions(@Query() paginator: Paginator): Promise<PaginatorResponse<AuctionResponse>> {
    return this.auctionsService.findActiveAuctions(paginator);
  }

  @ApiOperation({
    summary: 'Get auction details',
    description: 'Get details of a specific auction. Current price is fetched from cache for real-time accuracy.',
  })
  @ApiStandardResponse(AuctionDetailResponse, false)
  @Public()
  @Get(':id')
  async getAuction(@Param('id', ParseIntPipe) auctionId: number): Promise<AuctionDetailResponse> {
    return this.auctionsService.findOne(auctionId);
  }

  @ApiOperation({
    summary: 'Cancel an auction',
    description: 'Cancel an active auction. Only the owner can cancel, and only if no one has bid yet.',
  })
  @ApiStandardResponse(AuctionResponse, false)
  @ApiBearerAuth('jwt-auth')
  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async cancelAuction(@Param('id', ParseIntPipe) auctionId: number, @CurrentUser() user: User): Promise<AuctionResponse> {
    return this.auctionsService.cancelAuction(auctionId, user.id);
  }

  @ApiOperation({
    summary: 'Update an auction',
    description: 'Update auction details (title/description/end time). Only the owner can update, and only active auctions can be modified. End time can only be extended.',
  })
  @ApiStandardResponse(AuctionResponse, false)
  @ApiBearerAuth('jwt-auth')
  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  async updateAuction(@Param('id', ParseIntPipe) auctionId: number, @Body() updateAuctionDto: UpdateAuctionDto, @CurrentUser() user: User): Promise<AuctionResponse> {
    return this.auctionsService.updateAuction(auctionId, updateAuctionDto, user.id);
  }
}
