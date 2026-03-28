import { Test, TestingModule } from '@nestjs/testing';
import { Paginator, PaginatorResponse } from '@core/models';
import { User } from '@modules/users';
import { BidController } from './bid.controller';
import { BidService } from './bid.service';
import { MyBidResponse } from './dto';
import { createMock, DeepMocked } from '@golevelup/ts-jest';

describe('BidController', () => {
  let controller: BidController;
  let bidService: DeepMocked<BidService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BidController],
      providers: [
        {
          provide: BidService,
          useValue: createMock<BidService>(),
        },
      ],
    }).compile();

    controller = module.get<BidController>(BidController);
    bidService = module.get(BidService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getMyBids', () => {
    it('should call bidService.findMyBids with correct parameters and return the paginated result', async () => {
      const mockUser = { id: 123 } as User;

      const mockPaginator = new Paginator();
      mockPaginator.page = 2;
      mockPaginator.limit = 20;

      const mockServiceResponse = new PaginatorResponse<MyBidResponse>();
      mockServiceResponse.items = [];
      mockServiceResponse.total = 0;
      mockServiceResponse.page = 2;
      mockServiceResponse.limit = 20;

      bidService.findMyBids.mockResolvedValue(mockServiceResponse);

      const result = await controller.getMyBids(mockPaginator, mockUser);

      expect(bidService.findMyBids).toHaveBeenCalledTimes(1);
      expect(bidService.findMyBids).toHaveBeenCalledWith(mockUser.id, mockPaginator);

      expect(result).toBe(mockServiceResponse);
    });
  });
});
