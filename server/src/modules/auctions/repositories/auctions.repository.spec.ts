import { Test, TestingModule } from '@nestjs/testing';
import { AuctionsRepository } from './auctions.repository';
import { AuctionStatus } from '../enums';
import { Auction } from '../entities';
import { createMock, DeepMocked } from '@golevelup/ts-jest';
import { DataSource, EntityManager, FindOperator } from 'typeorm';

describe('AuctionsRepository', () => {
  let repository: AuctionsRepository;
  let dataSource: DeepMocked<DataSource>;

  beforeEach(async () => {
    dataSource = createMock<DataSource>({
      createEntityManager: jest.fn().mockReturnValue(createMock<EntityManager>()),
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuctionsRepository,
        {
          provide: DataSource,
          useValue: dataSource,
        },
      ],
    }).compile();

    repository = module.get<AuctionsRepository>(AuctionsRepository);

    jest.clearAllMocks();
  });

  describe('findActiveAuctions', () => {
    it('should call inherited findAndCount with correct criteria, endTime filter and pagination', async () => {
      const skip = 10;
      const take = 20;

      const mockAuctions = [createMock<Auction>(), createMock<Auction>()];
      const mockResult: [Auction[], number] = [mockAuctions, 2];

      jest.spyOn(repository, 'findAndCount').mockResolvedValue(mockResult);

      const result = await repository.findActiveAuctions(skip, take);

      expect(repository.findAndCount).toHaveBeenCalledWith({
        where: {
          status: AuctionStatus.ACTIVE,
          endTime: expect.any(FindOperator) as never,
        },
        relations: ['owner', 'winner'],
        skip,
        take,
        order: { createdAt: 'DESC' },
      });

      expect(result).toEqual(mockResult);
    });

    it('should return empty array and zero count when no active auctions exist', async () => {
      jest.spyOn(repository, 'findAndCount').mockResolvedValue([[], 0]);

      const result = await repository.findActiveAuctions(0, 10);

      expect(result).toEqual([[], 0]);
    });
  });

  describe('findPaginatedAuctionsByOwner', () => {
    it('should call inherited findAndCount with correct ownerId and pagination', async () => {
      const ownerId = 5;
      const skip = 10;
      const take = 20;

      const mockAuctions = [createMock<Auction>(), createMock<Auction>()];
      const mockResult: [Auction[], number] = [mockAuctions, 2];

      jest.spyOn(repository, 'findAndCount').mockResolvedValue(mockResult);

      const result = await repository.findPaginatedAuctionsByOwner(ownerId, skip, take);

      expect(repository.findAndCount).toHaveBeenCalledWith({
        where: { ownerId },
        skip,
        take,
        order: { createdAt: 'DESC' },
      });

      expect(result).toEqual(mockResult);
    });

    it('should return empty array and zero count when owner has no auctions', async () => {
      jest.spyOn(repository, 'findAndCount').mockResolvedValue([[], 0]);

      const result = await repository.findPaginatedAuctionsByOwner(99, 0, 10);

      expect(result).toEqual([[], 0]);
      expect(repository.findAndCount).toHaveBeenCalledWith({
        where: { ownerId: 99 },
        skip: 0,
        take: 10,
        order: { createdAt: 'DESC' },
      });
    });
  });

  describe('findByIdWithRelations', () => {
    it('should call inherited findOne with correct ID and relations', async () => {
      const auctionId = 1;
      const mockAuction = createMock<Auction>();

      jest.spyOn(repository, 'findOne').mockResolvedValue(mockAuction);

      const result = await repository.findByIdWithRelations(auctionId);

      expect(repository.findOne).toHaveBeenCalledWith({
        where: { id: auctionId },
        relations: ['owner', 'winner', 'images'],
      });

      expect(result).toEqual(mockAuction);
    });

    it('should return null if auction is not found', async () => {
      const auctionId = 99;

      jest.spyOn(repository, 'findOne').mockResolvedValue(null);

      const result = await repository.findByIdWithRelations(auctionId);

      expect(repository.findOne).toHaveBeenCalledWith({
        where: { id: auctionId },
        relations: ['owner', 'winner', 'images'],
      });

      expect(result).toBeNull();
    });
  });
});
