import { Controller, Post, Body, UseGuards, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ApiStandardResponse, CurrentUser } from '@core/decorators';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { User } from '@modules/users';
import { AuctionsService } from './auctions.service';
import { AuctionResponse } from './models';
import { CreateAuctionDto } from './dto';

@ApiTags('Auctions')
@Controller('auctions')
export class AuctionsController {
  constructor(private readonly auctionsService: AuctionsService) {}

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
}
