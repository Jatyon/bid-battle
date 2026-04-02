import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { BidRepository } from './bid.repository';
import { Bid } from '../entities';

describe('BidRepository', () => {
  let repository: BidRepository;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BidRepository,
        {
          provide: DataSource,
          useValue: { createEntityManager: jest.fn().mockReturnValue({}) },
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
    it('should call findAndCount with correct parameters', async () => {
      const mockBids = [
        { id: 1, amount: 200 },
        { id: 2, amount: 150 },
      ] as Bid[];
      const mockResult: [Bid[], number] = [mockBids, 2];
      const findAndCountSpy = jest.spyOn(repository, 'findAndCount').mockResolvedValue(mockResult);

      const result = await repository.findPaginatedBidByAuction(10, 0, 10);

      expect(findAndCountSpy).toHaveBeenCalledWith({
        where: { auctionId: 10 },
        relations: ['user'],
        order: { amount: 'DESC' },
        skip: 0,
        take: 10,
      });
      expect(result).toEqual(mockResult);
    });

    it('should return empty array when no bids exist for auction', async () => {
      jest.spyOn(repository, 'findAndCount').mockResolvedValue([[], 0]);

      const [items, total] = await repository.findPaginatedBidByAuction(99, 0, 10);

      expect(items).toEqual([]);
      expect(total).toBe(0);
    });

    it('should respect skip and take for pagination', async () => {
      const findAndCountSpy = jest.spyOn(repository, 'findAndCount').mockResolvedValue([[], 50]);

      await repository.findPaginatedBidByAuction(1, 20, 10);

      expect(findAndCountSpy).toHaveBeenCalledWith(expect.objectContaining({ skip: 20, take: 10 }));
    });
  });

  describe('findPaginatedBidByUser', () => {
    it('should call findAndCount with correct parameters', async () => {
      const mockBids = [{ id: 3, amount: 500 }] as Bid[];
      const mockResult: [Bid[], number] = [mockBids, 1];
      const findAndCountSpy = jest.spyOn(repository, 'findAndCount').mockResolvedValue(mockResult);

      const result = await repository.findPaginatedBidByUser(5, 10, 20);

      expect(findAndCountSpy).toHaveBeenCalledWith({
        where: { userId: 5 },
        relations: ['auction'],
        order: { amount: 'DESC' },
        skip: 10,
        take: 20,
      });
      expect(result).toEqual(mockResult);
    });

    it('should return empty array when user has no bids', async () => {
      jest.spyOn(repository, 'findAndCount').mockResolvedValue([[], 0]);

      const [items, total] = await repository.findPaginatedBidByUser(99, 0, 10);

      expect(items).toEqual([]);
      expect(total).toBe(0);
    });

    it('should respect skip and take for pagination', async () => {
      const findAndCountSpy = jest.spyOn(repository, 'findAndCount').mockResolvedValue([[], 100]);

      await repository.findPaginatedBidByUser(1, 40, 20);

      expect(findAndCountSpy).toHaveBeenCalledWith(expect.objectContaining({ skip: 40, take: 20 }));
    });
  });

  describe('findByOrphanedIds', () => {
    const makeRawRow = (overrides: Partial<Record<string, unknown>> = {}) => ({
      id: 1,
      amount: 500,
      auction_id: 10,
      user_id: 2,
      created_at: new Date('2026-01-01'),
      updated_at: new Date('2026-01-02'),
      ...overrides,
    });

    it('should execute raw SQL with correct placeholders for given ids', async () => {
      const querySpy = jest.spyOn(repository, 'query').mockResolvedValue([]);

      await repository.findByOrphanedIds([1, 2, 3]);

      expect(querySpy).toHaveBeenCalledTimes(1);

      const [sql, params] = querySpy.mock.calls[0];

      expect(sql).toContain('RANK() OVER (PARTITION BY auction_id ORDER BY amount DESC, id ASC)');
      expect(sql).toContain('WHERE auction_id IN (?, ?, ?)');
      expect(sql).toContain('WHERE rnk = 1');
      expect(params).toEqual([1, 2, 3]);
    });

    it('should return empty array when query returns no rows', async () => {
      jest.spyOn(repository, 'query').mockResolvedValue([]);

      const result = await repository.findByOrphanedIds([42]);

      expect(result).toEqual([]);
    });

    it('should correctly map snake_case raw rows to Bid entity instances', async () => {
      const rawRow = makeRawRow();
      jest.spyOn(repository, 'query').mockResolvedValue([rawRow]);

      const [bid] = await repository.findByOrphanedIds([10]);

      expect(bid).toBeInstanceOf(Bid);
      expect(bid.id).toBe(1);
      expect(bid.amount).toBe(500);
      expect(bid.auctionId).toBe(10);
      expect(bid.userId).toBe(2);
      expect(bid.createdAt).toEqual(new Date('2026-01-01'));
      expect(bid.updatedAt).toEqual(new Date('2026-01-02'));
    });

    it('should convert bigint-like string values from DB to numbers', async () => {
      const rawRow = makeRawRow({ id: '7', amount: '12345', auction_id: '3', user_id: '99' });
      jest.spyOn(repository, 'query').mockResolvedValue([rawRow]);

      const [bid] = await repository.findByOrphanedIds([3]);

      expect(typeof bid.id).toBe('number');
      expect(typeof bid.amount).toBe('number');
      expect(typeof bid.auctionId).toBe('number');
      expect(typeof bid.userId).toBe('number');
      expect(bid.id).toBe(7);
      expect(bid.amount).toBe(12345);
    });

    it('should return one bid per auction (highest amount wins)', async () => {
      const rawRows = [makeRawRow({ id: 10, amount: 900, auction_id: 1, user_id: 5 }), makeRawRow({ id: 20, amount: 400, auction_id: 2, user_id: 6 })];
      jest.spyOn(repository, 'query').mockResolvedValue(rawRows);

      const result = await repository.findByOrphanedIds([1, 2]);

      expect(result).toHaveLength(2);
      expect(result[0].auctionId).toBe(1);
      expect(result[0].amount).toBe(900);
      expect(result[1].auctionId).toBe(2);
      expect(result[1].amount).toBe(400);
    });

    it('should generate correct number of placeholders for a single id', async () => {
      const querySpy = jest.spyOn(repository, 'query').mockResolvedValue([]);

      await repository.findByOrphanedIds([5]);

      const [sql] = querySpy.mock.calls[0];
      expect(sql).toContain('WHERE auction_id IN (?)');
    });

    it('should propagate errors thrown by query()', async () => {
      jest.spyOn(repository, 'query').mockRejectedValue(new Error('DB connection lost'));

      await expect(repository.findByOrphanedIds([1])).rejects.toThrow('DB connection lost');
    });
  });
});
