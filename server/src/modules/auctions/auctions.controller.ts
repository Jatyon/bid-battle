import { Controller, Post, Body, UseGuards, HttpCode, UseInterceptors, UploadedFiles, BadRequestException, Get, Query, Param, ParseIntPipe, Delete, Patch } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes, ApiBody, ApiPayloadTooLargeResponse } from '@nestjs/swagger';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiStandardResponse, CurrentUser, Public } from '@core/decorators';
import { MessageResponse, Paginator, PaginatorResponse } from '@core/models';
import { OptionalJwtAuthGuard } from '@modules/auth/guards/optional-jwt-auth.guard';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { BidResponse } from '@modules/bid';
import { User } from '@modules/users';
import { FileUploadService } from '@shared/file-upload';
import { AuctionDetailResponse, AuctionResponse, CreateAuctionDto, GetAuctionsQueryDto, UploadedFileDto, UpdateAuctionDto, UpdateAuctionImagesDto, MyAuctionResponse } from './dto';
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
    description: 'Upload multiple images for an auction (max 10). Supported formats: jpg, png.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        images: {
          type: 'array',
          items: {
            type: 'string',
            format: 'binary',
          },
          description: 'Auction images (max 10 files)',
        },
      },
    },
  })
  @ApiStandardResponse(UploadedFileDto, true)
  @ApiPayloadTooLargeResponse({ description: 'Payload Too Large: uploaded files are too large' })
  @ApiBearerAuth('jwt-auth')
  @HttpCode(200)
  @Post('/upload-images')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FilesInterceptor('images', 10))
  async uploadAuctionImages(@UploadedFiles() files: Express.Multer.File[], @I18n() i18n: I18nContext): Promise<UploadedFileDto[]> {
    if (!files || files.length === 0) {
      throw new BadRequestException(i18n.t('error.validation.file.no_file_provided'));
    }

    const uploadedFiles = await this.fileUploadService.uploadMultiple(files, this.fileUploadService.getAuctionImageUploadOptions(), i18n);

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
    description: 'Get list of active auctions with pagination, optional full-text search on title, price range filter and sorting.',
  })
  @ApiStandardResponse(PaginatorResponse, false, AuctionResponse)
  @Public()
  @Get()
  async getAuctions(@Query() query: GetAuctionsQueryDto): Promise<PaginatorResponse<AuctionResponse>> {
    return this.auctionsService.findActiveAuctions(query);
  }

  @ApiOperation({
    summary: 'Get my auctions',
    description: 'Get list of auctions created by the currently logged-in user.',
  })
  @ApiStandardResponse(PaginatorResponse, false, MyAuctionResponse)
  @ApiBearerAuth('jwt-auth')
  @UseGuards(JwtAuthGuard)
  @Get('my/auctions')
  async getMyAuctions(@Query() paginator: Paginator, @CurrentUser() user: User): Promise<PaginatorResponse<MyAuctionResponse>> {
    return this.auctionsService.findMyAuctions(user.id, paginator);
  }

  @ApiOperation({
    summary: 'Get auction bid history',
    description: 'Get paginated list of bids for a specific auction.',
  })
  @ApiStandardResponse(PaginatorResponse, false, BidResponse)
  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Get(':id/bids')
  async getAuctionBids(@Param('id', ParseIntPipe) auctionId: number, @Query() paginator: Paginator, @CurrentUser() user?: User): Promise<PaginatorResponse<BidResponse>> {
    return this.auctionsService.findAuctionBids(auctionId, paginator, user?.id);
  }

  @ApiOperation({
    summary: 'Get auction details',
    description: 'Get details of a specific auction. Current price is fetched from cache for real-time accuracy.',
  })
  @ApiStandardResponse(AuctionDetailResponse, false)
  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Get(':id')
  async getAuction(@Param('id', ParseIntPipe) auctionId: number, @CurrentUser() user?: User): Promise<AuctionDetailResponse> {
    return this.auctionsService.findOne(auctionId, user?.id);
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

  @ApiOperation({
    summary: 'Update auction images',
    description: 'Replace auction images. Only the owner can update, and only active auctions can be modified.',
  })
  @ApiStandardResponse(MessageResponse, false)
    @ApiPayloadTooLargeResponse({ description: 'Payload Too Large: uploaded files are too large' })
  @ApiBearerAuth('jwt-auth')
  @ApiConsumes('multipart/form-data')
  @HttpCode(200)
  @Patch(':id/images')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FilesInterceptor('images', 10))
  async updateAuctionImages(
    @Param('id', ParseIntPipe) auctionId: number,
    @UploadedFiles() files: Express.Multer.File[],
    @Body() uploadDto: UpdateAuctionImagesDto,
    @CurrentUser() user: User,
    @I18n() i18n: I18nContext,
  ): Promise<MessageResponse> {
    const newFiles = files || [];
    const existingUrls = uploadDto.existingImageUrls || [];

    await this.auctionsService.updateAuctionImages(auctionId, user.id, newFiles, existingUrls, uploadDto.primaryImageIndex, i18n);

    return {
      message: i18n.t('auction.info.update_images_success'),
    };
  }
}
