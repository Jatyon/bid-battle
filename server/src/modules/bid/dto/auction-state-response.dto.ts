import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AuctionEventDto } from './auction-event-response.dto';
import { IAuctionState } from '../interfaces';

export class AuctionStateDto extends AuctionEventDto implements IAuctionState {
  @ApiProperty({
    description:
      'The current highest bid amount (or starting price if no bids placed yet) expressed as a whole integer in the smallest currency unit (e.g. grosz: 1250 = 12.50 PLN).',
    example: 1250,
  })
  currentPrice: number;

  @ApiProperty({
    description: 'Indicates whether the user requesting the state is the current highest bidder',
    example: true,
  })
  isLeading: boolean;

  @ApiProperty({
    description: 'Indicates if the auction is currently active and accepting bids',
    example: true,
  })
  isActive: boolean;

  @ApiPropertyOptional({
    description: 'Time remaining in seconds until the auction ends',
    example: 3600,
  })
  timeLeft?: number;

  @ApiPropertyOptional({
    description: 'The number of users currently present in the auction room',
    example: 42,
  })
  participantsCount?: number;
}
