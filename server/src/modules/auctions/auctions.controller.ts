import { Controller } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuctionsService } from './auctions.service';

@ApiTags('Auctions')
@Controller('auctions')
export class AuctionsController {
  constructor(private readonly auctionsService: AuctionsService) {}
}
