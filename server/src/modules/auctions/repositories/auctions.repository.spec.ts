import { Test, TestingModule } from '@nestjs/testing';
import { SortOrder } from '@core/enums';
import { AuctionCategory, AuctionSortBy, AuctionStatus } from '../enums';
import { AuctionsRepository } from './auctions.repository';
import { Auction } from '../entities';
import { createMock, DeepMocked } from '@golevelup/ts-jest';
import { DataSource, EntityManager, SelectQueryBuilder } from 'typeorm';

describe('AuctionsRepository', () => {
  let repository: AuctionsRepository;
  let dataSource: DeepMocked<DataSource>;

  function buildQbMock(result: [Auction[], number] = [[], 0]) {
    const qb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue(result),
    } as unknown as SelectQueryBuilder<Auction>;
    return qb;
  }

  function spyQb(qb: SelectQueryBuilder<Auction>) {
    jest.spyOn(repository, 'createQueryBuilder').mockReturnValue(qb as unknown as SelectQueryBuilder<Auction>);
  }

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
    it('should query with ACTIVE status, owner/winner joins, default sort and pagination', async () => {
      const skip = 10;
      const take = 20;
      const mockAuctions = [createMock<Auction>(), createMock<Auction>()];
      const qb = buildQbMock([mockAuctions, 2]);
      spyQb(qb);

      const result = await repository.findActiveAuctions(skip, take);

      expect(repository.createQueryBuilder).toHaveBeenCalledWith('auction');
      expect(qb.leftJoinAndSelect).toHaveBeenCalledWith('auction.owner', 'owner');
      expect(qb.leftJoinAndSelect).toHaveBeenCalledWith('auction.winner', 'winner');
      expect(qb.where).toHaveBeenCalledWith('auction.status = :status', { status: AuctionStatus.ACTIVE });
      expect(qb.orderBy).toHaveBeenCalledWith(`auction.${AuctionSortBy.CREATED_AT}`, SortOrder.DESC);
      expect(qb.skip).toHaveBeenCalledWith(skip);
      expect(qb.take).toHaveBeenCalledWith(take);
      expect(qb.andWhere).not.toHaveBeenCalled();
      expect(result).toEqual([mockAuctions, 2]);
    });

    it('should return empty array and zero count when no active auctions exist', async () => {
      const qb = buildQbMock([[], 0]);
      spyQb(qb);

      const result = await repository.findActiveAuctions(0, 10);

      expect(result).toEqual([[], 0]);
    });

    it('should add FULLTEXT filter when search is provided', async () => {
      const qb = buildQbMock([[], 0]);
      spyQb(qb);

      await repository.findActiveAuctions(0, 10, { search: 'watch' });

      expect(qb.andWhere).toHaveBeenCalledWith('MATCH(auction.title) AGAINST (:search IN BOOLEAN MODE)', { search: 'watch*' });
    });

    it('should add minPrice filter when minPrice is provided', async () => {
      const qb = buildQbMock([[], 0]);
      spyQb(qb);

      await repository.findActiveAuctions(0, 10, { minPrice: 100 });

      expect(qb.andWhere).toHaveBeenCalledWith('auction.currentPrice >= :minPrice', { minPrice: 100 });
    });

    it('should add maxPrice filter when maxPrice is provided', async () => {
      const qb = buildQbMock([[], 0]);
      spyQb(qb);

      await repository.findActiveAuctions(0, 10, { maxPrice: 5000 });

      expect(qb.andWhere).toHaveBeenCalledWith('auction.currentPrice <= :maxPrice', { maxPrice: 5000 });
    });

    it('should apply minPrice AND maxPrice simultaneously', async () => {
      const qb = buildQbMock([[], 0]);
      spyQb(qb);

      await repository.findActiveAuctions(0, 10, { minPrice: 100, maxPrice: 5000 });

      expect(qb.andWhere).toHaveBeenCalledWith('auction.currentPrice >= :minPrice', { minPrice: 100 });
      expect(qb.andWhere).toHaveBeenCalledWith('auction.currentPrice <= :maxPrice', { maxPrice: 5000 });
    });

    it('should use custom sortBy and sortOrder when provided', async () => {
      const qb = buildQbMock([[], 0]);
      spyQb(qb);

      await repository.findActiveAuctions(0, 10, { sortBy: AuctionSortBy.END_TIME, sortOrder: SortOrder.ASC });

      expect(qb.orderBy).toHaveBeenCalledWith(`auction.${AuctionSortBy.END_TIME}`, SortOrder.ASC);
    });

    it('should trim whitespace from search term', async () => {
      const qb = buildQbMock([[], 0]);
      spyQb(qb);

      await repository.findActiveAuctions(0, 10, { search: '  vintage  ' });

      expect(qb.andWhere).toHaveBeenCalledWith('MATCH(auction.title) AGAINST (:search IN BOOLEAN MODE)', { search: 'vintage*' });
    });

    it('should not add search filter when search is an empty string', async () => {
      const qb = buildQbMock([[], 0]);
      spyQb(qb);

      await repository.findActiveAuctions(0, 10, { search: '' });

      expect(qb.andWhere).not.toHaveBeenCalled();
    });

    it('should add category filter when category is provided', async () => {
      const qb = buildQbMock([[], 0]);
      spyQb(qb);

      await repository.findActiveAuctions(0, 10, { category: AuctionCategory.ELECTRONICS });

      expect(qb.andWhere).toHaveBeenCalledWith('auction.category = :category', { category: AuctionCategory.ELECTRONICS });
    });

    it('should not add category filter when category is undefined', async () => {
      const qb = buildQbMock([[], 0]);
      spyQb(qb);

      await repository.findActiveAuctions(0, 10, {});

      expect(qb.andWhere).not.toHaveBeenCalled();
    });

    it('should combine category with other filters', async () => {
      const qb = buildQbMock([[], 0]);
      spyQb(qb);

      await repository.findActiveAuctions(0, 10, {
        category: AuctionCategory.FASHION,
        search: 'shoes',
        minPrice: 50,
      });

      expect(qb.andWhere).toHaveBeenCalledWith('MATCH(auction.title) AGAINST (:search IN BOOLEAN MODE)', { search: 'shoes*' });
      expect(qb.andWhere).toHaveBeenCalledWith('auction.category = :category', { category: AuctionCategory.FASHION });
      expect(qb.andWhere).toHaveBeenCalledWith('auction.currentPrice >= :minPrice', { minPrice: 50 });
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
