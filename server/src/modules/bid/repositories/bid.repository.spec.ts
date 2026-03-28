import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { BidRepository } from './bid.repository';
import { Bid } from '../entities';

describe('BidRepository', () => {
  let repository: BidRepository;

  const mockDataSource = {
    createEntityManager: jest.fn().mockReturnValue({}),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BidRepository,
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
      ],
    }).compile();

    repository = module.get<BidRepository>(BidRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(repository).toBeDefined();
  });

  describe('findPaginatedBidByAuction', () => {
    it('should call findAndCount with correct parameters for fetching bids by auction', async () => {
      const mockAuctionId = 10;
      const skip = 0;
      const take = 10;
      const mockBids = [
        { id: 1, amount: 200 },
        { id: 2, amount: 150 },
      ] as Bid[];
      const mockResult: [Bid[], number] = [mockBids, 2];

      const findAndCountSpy = jest.spyOn(repository, 'findAndCount').mockResolvedValue(mockResult);

      const result = await repository.findPaginatedBidByAuction(mockAuctionId, skip, take);

      expect(findAndCountSpy).toHaveBeenCalledTimes(1);
      expect(findAndCountSpy).toHaveBeenCalledWith({
        where: { auctionId: mockAuctionId },
        relations: ['user'],
        order: { amount: 'DESC' },
        skip,
        take,
      });
      expect(result).toEqual(mockResult);
    });
  });

  describe('findPaginatedBidByUser', () => {
    it('should call findAndCount with correct parameters for fetching bids by user', async () => {
      const mockUserId = 5;
      const skip = 10;
      const take = 20;
      const mockBids = [{ id: 3, amount: 500 }] as Bid[];
      const mockResult: [Bid[], number] = [mockBids, 1];

      const findAndCountSpy = jest.spyOn(repository, 'findAndCount').mockResolvedValue(mockResult);

      const result = await repository.findPaginatedBidByUser(mockUserId, skip, take);

      expect(findAndCountSpy).toHaveBeenCalledTimes(1);
      expect(findAndCountSpy).toHaveBeenCalledWith({
        where: { userId: mockUserId },
        relations: ['auction'],
        order: { amount: 'DESC' },
        skip,
        take,
      });
      expect(result).toEqual(mockResult);
    });
  });
});
