import { Test, TestingModule } from '@nestjs/testing';
import { AuctionsRepository } from './auctions.repository';
import { AuctionStatus } from '../enums';
import { Auction } from '../entities';
import { createMock, DeepMocked } from '@golevelup/ts-jest';
import { DataSource, EntityManager } from 'typeorm';

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
    it('should call inherited findAndCount with correct criteria and pagination', async () => {
      const skip = 10;
      const take = 20;

      const mockAuctions = [createMock<Auction>(), createMock<Auction>()];
      const mockResult: [Auction[], number] = [mockAuctions, 2];

      jest.spyOn(repository, 'findAndCount').mockResolvedValue(mockResult);

      const result = await repository.findActiveAuctions(skip, take);

      expect(repository.findAndCount).toHaveBeenCalledWith({
        where: { status: AuctionStatus.ACTIVE },
        relations: ['owner', 'winner'],
        skip,
        take,
        order: { createdAt: 'DESC' },
      });

      expect(result).toEqual(mockResult);
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
