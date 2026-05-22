import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ApiStandardResponse, CurrentUser } from '@core/decorators';
import { Paginator, PaginatorResponse } from '@core/models';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { User } from '@modules/users';
import { BidService } from './bid.service';
import { MyBidResponse } from './dto';

@ApiTags('Bids')
@Controller('bids')
export class BidController {
  constructor(private readonly bidService: BidService) {}

  @ApiOperation({
    summary: 'Get my bids',
    description: 'Get list of bids placed by the currently logged-in user along with auction details.',
  })
  @ApiStandardResponse(PaginatorResponse, false, MyBidResponse)
  @ApiBearerAuth('jwt-auth')
  @UseGuards(JwtAuthGuard)
  @Get('my')
  async getMyBids(@Query() paginator: Paginator, @CurrentUser() user: User): Promise<PaginatorResponse<MyBidResponse>> {
    return this.bidService.findMyBids(user.id, paginator);
  }
}
