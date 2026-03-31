import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { Language } from '@core/enums/language.enum';
import { createAuctionFixture } from '@test/fixtures/auctions.fixtures';
import { createUserFixture, createUserPreferencesFixture } from '@test/fixtures/users.fixtures';
import { BidGateway } from '@modules/bid/bid.gateway';
import { RedisService } from '@shared/redis';
import { MailService } from '@shared/mail';
import { UsersService, UserPreferencesService } from '@modules/users';
import { AuctionEndProcessor } from './auctions-end.processor';
import { IAuctionJob } from './interfaces';
import { AuctionStatus } from './enums';
import { Auction } from './entities';
import { createMock, DeepMocked } from '@golevelup/ts-jest';
import { DataSource, EntityManager } from 'typeorm';
import { Job } from 'bullmq';

describe('AuctionEndProcessor', () => {
  let processor: AuctionEndProcessor;
  let redisService: DeepMocked<RedisService>;
  let bidGateway: DeepMocked<BidGateway>;
  let dataSource: DeepMocked<DataSource>;
  let mailService: DeepMocked<MailService>;
  let usersService: DeepMocked<UsersService>;
  let userPreferencesService: DeepMocked<UserPreferencesService>;

  const createJob = (auctionId: number): Job<IAuctionJob> => ({ data: { auctionId } }) as unknown as Job<IAuctionJob>;

  const mockTransactionWith = (auction: Auction | null) => {
    dataSource.transaction.mockImplementation(async (arg1: unknown, arg2?: unknown) => {
      const cb = (arg2 || arg1) as (em: EntityManager) => Promise<void>;

      const mockEm = createMock<EntityManager>();
      mockEm.findOne.mockResolvedValue(auction);
      mockEm.update.mockResolvedValue({ affected: 1, raw: [], generatedMaps: [] });

      return cb(mockEm);
    });
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuctionEndProcessor,
        {
          provide: RedisService,
          useValue: createMock<RedisService>(),
        },
        {
          provide: BidGateway,
          useValue: createMock<BidGateway>(),
        },
        {
          provide: DataSource,
          useValue: createMock<DataSource>(),
        },
        {
          provide: MailService,
          useValue: createMock<MailService>(),
        },
        {
          provide: UsersService,
          useValue: createMock<UsersService>(),
        },
        {
          provide: UserPreferencesService,
          useValue: createMock<UserPreferencesService>(),
        },
      ],
    }).compile();

    processor = module.get<AuctionEndProcessor>(AuctionEndProcessor);
    redisService = module.get(RedisService);
    bidGateway = module.get(BidGateway);
    dataSource = module.get(DataSource);
    mailService = module.get(MailService);
    usersService = module.get(UsersService);
    userPreferencesService = module.get(UserPreferencesService);

    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });

  describe('when Redis has no data for the auction (already cleaned up)', () => {
    it('should skip processing and warn when getLivePrice returns null', async () => {
      redisService.getLivePrice.mockResolvedValue(null);

      await processor.process(createJob(1));

      expect(Logger.prototype.warn).toHaveBeenCalledWith('Auction 1 data already cleaned up from Redis — skipping');
      expect(dataSource.transaction).not.toHaveBeenCalled();
      expect(redisService.cleanupAuction).not.toHaveBeenCalled();
      expect(bidGateway.notifyAuctionEnd).not.toHaveBeenCalled();
    });
  });

  describe('happy path — auction ends successfully', () => {
    it('should update DB, clean up Redis, invalidate list cache and notify clients with winner and final price', async () => {
      const auction = createAuctionFixture({ id: 1, status: AuctionStatus.ACTIVE });

      redisService.getLivePrice.mockResolvedValue(500);
      redisService.getHighestBidderId.mockResolvedValue(42);
      mockTransactionWith(auction);
      usersService.findOneBy.mockResolvedValue(createUserFixture({ id: 1 }));
      userPreferencesService.findByUserId.mockResolvedValue(createUserPreferencesFixture({ notifyOnAuctionEnd: false }));

      await processor.process(createJob(1));

      expect(dataSource.transaction).toHaveBeenCalled();

      expect(redisService.cleanupAuction).toHaveBeenCalledWith(1);
      expect(redisService.invalidateCache).toHaveBeenCalledWith('auctions:active:*');

      expect(bidGateway.notifyAuctionEnd).toHaveBeenCalledWith(1, 42, 500);

      expect(Logger.prototype.log).toHaveBeenCalledWith('Auction 1 ended — winner: 42, price: 500');
    });

    it('should pass correct data to em.update — ENDED status, finalPrice, winnerId, endedAt', async () => {
      const auction = createAuctionFixture({ id: 1, status: AuctionStatus.ACTIVE, startingPrice: 100 });

      redisService.getLivePrice.mockResolvedValue(250);
      redisService.getHighestBidderId.mockResolvedValue(7);

      let capturedUpdate: Record<string, unknown> = {};

      dataSource.transaction.mockImplementation(async (arg1: unknown, arg2?: unknown) => {
        const cb = (arg2 || arg1) as (em: EntityManager) => Promise<void>;

        const mockEm = createMock<EntityManager>();
        mockEm.findOne.mockResolvedValue(auction);

        mockEm.update.mockImplementation(async (_entity: unknown, _id: unknown, data: unknown) => {
          capturedUpdate = data as Record<string, unknown>;
          return Promise.resolve({ affected: 1, raw: [], generatedMaps: [] });
        });

        return cb(mockEm);
      });

      await processor.process(createJob(1));

      expect(capturedUpdate).toEqual(
        expect.objectContaining({
          status: AuctionStatus.ENDED,
          currentPrice: 250,
          winnerId: 7,
          endedAt: expect.any(Date) as unknown as Date,
        }),
      );
    });

    it('should notify with winnerId=undefined when no bids were placed (getHighestBidderId returns null)', async () => {
      const auction = createAuctionFixture({ id: 2, status: AuctionStatus.ACTIVE });

      redisService.getLivePrice.mockResolvedValue(100);
      redisService.getHighestBidderId.mockResolvedValue(null);
      mockTransactionWith(auction);
      usersService.findOneBy.mockResolvedValue(createUserFixture({ id: 1 }));
      userPreferencesService.findByUserId.mockResolvedValue(createUserPreferencesFixture({ notifyOnAuctionEnd: false }));

      await processor.process(createJob(2));

      expect(bidGateway.notifyAuctionEnd).toHaveBeenCalledWith(2, undefined, 100);
      expect(Logger.prototype.log).toHaveBeenCalledWith('Auction 2 ended — winner: None, price: 100');
    });

    it('should set winnerId=null in DB update when getHighestBidderId returns null', async () => {
      const auction = createAuctionFixture({ id: 3, status: AuctionStatus.ACTIVE });

      redisService.getLivePrice.mockResolvedValue(100);
      redisService.getHighestBidderId.mockResolvedValue(null);
      usersService.findOneBy.mockResolvedValue(createUserFixture({ id: 1 }));
      userPreferencesService.findByUserId.mockResolvedValue(createUserPreferencesFixture({ notifyOnAuctionEnd: false }));

      let capturedUpdate: Record<string, unknown> = {};

      dataSource.transaction.mockImplementation(async (arg1: unknown, arg2?: unknown) => {
        const cb = (arg2 || arg1) as (em: EntityManager) => Promise<void>;

        const mockEm = createMock<EntityManager>();
        mockEm.findOne.mockResolvedValue(auction);

        mockEm.update.mockImplementation((_entity: unknown, _id: unknown, data: unknown) => {
          capturedUpdate = data as Record<string, unknown>;
          return Promise.resolve({ affected: 1, raw: [], generatedMaps: [] });
        });

        return cb(mockEm);
      });

      await processor.process(createJob(3));

      expect(capturedUpdate).toMatchObject({ winnerId: null });
    });
  });

  describe('email notifications — sendEndNotificationEmails', () => {
    const flushPromises = () => new Promise((resolve) => setImmediate(resolve));

    it('should send owner email when owner has notifyOnAuctionEnd enabled', async () => {
      const owner = createUserFixture({ id: 1, email: 'owner@example.com', firstName: 'John', lastName: 'Doe' });
      const auction = createAuctionFixture({ id: 1, status: AuctionStatus.ACTIVE, ownerId: 1, owner });

      redisService.getLivePrice.mockResolvedValue(500);
      redisService.getHighestBidderId.mockResolvedValue(null);
      mockTransactionWith(auction);
      usersService.findOneBy.mockResolvedValue(owner);
      userPreferencesService.findByUserId.mockResolvedValue(createUserPreferencesFixture({ notifyOnAuctionEnd: true, lang: Language.EN }));

      await processor.process(createJob(1));
      await flushPromises();

      expect(mailService.sendAuctionOwnerEmail).toHaveBeenCalledWith(owner.email, Language.EN, owner.concatName, auction.title, 500, 1, undefined);
    });

    it('should send owner email with winner name when auction has a winner', async () => {
      const owner = createUserFixture({ id: 1, email: 'owner@example.com', firstName: 'Alice', lastName: 'Smith' });
      const winner = createUserFixture({ id: 42, email: 'winner@example.com', firstName: 'Bob', lastName: 'Jones' });
      const auction = createAuctionFixture({ id: 1, status: AuctionStatus.ACTIVE, ownerId: 1, owner });

      redisService.getLivePrice.mockResolvedValue(750);
      redisService.getHighestBidderId.mockResolvedValue(42);
      mockTransactionWith(auction);

      usersService.findOneBy.mockImplementation(({ id }: { id: number }) => Promise.resolve(id === 42 ? winner : owner));
      userPreferencesService.findByUserId.mockResolvedValue(createUserPreferencesFixture({ notifyOnAuctionEnd: true, lang: Language.EN }));

      await processor.process(createJob(1));
      await flushPromises();

      expect(mailService.sendAuctionOwnerEmail).toHaveBeenCalledWith(owner.email, Language.EN, owner.concatName, auction.title, 750, 1, winner.concatName);
    });

    it('should send winner email when winner has notifyOnAuctionEnd enabled', async () => {
      const owner = createUserFixture({ id: 1, email: 'owner@example.com' });
      const winner = createUserFixture({ id: 42, email: 'winner@example.com', firstName: 'Bob', lastName: 'Jones' });
      const auction = createAuctionFixture({ id: 1, status: AuctionStatus.ACTIVE, ownerId: 1, owner });

      redisService.getLivePrice.mockResolvedValue(600);
      redisService.getHighestBidderId.mockResolvedValue(42);
      mockTransactionWith(auction);

      usersService.findOneBy.mockImplementation(({ id }: { id: number }) => Promise.resolve(id === 42 ? winner : owner));
      userPreferencesService.findByUserId.mockResolvedValue(createUserPreferencesFixture({ notifyOnAuctionEnd: true, lang: Language.PL }));

      await processor.process(createJob(1));
      await flushPromises();

      expect(mailService.sendAuctionWinnerEmail).toHaveBeenCalledWith(winner.email, Language.PL, winner.concatName, auction.title, 600, 1);
    });

    it('should not send winner email when winnerId is null', async () => {
      const owner = createUserFixture({ id: 1 });
      const auction = createAuctionFixture({ id: 1, status: AuctionStatus.ACTIVE, ownerId: 1, owner });

      redisService.getLivePrice.mockResolvedValue(100);
      redisService.getHighestBidderId.mockResolvedValue(null);
      mockTransactionWith(auction);
      usersService.findOneBy.mockResolvedValue(owner);
      userPreferencesService.findByUserId.mockResolvedValue(createUserPreferencesFixture({ notifyOnAuctionEnd: true, lang: Language.EN }));

      await processor.process(createJob(1));
      await flushPromises();

      expect(mailService.sendAuctionWinnerEmail).not.toHaveBeenCalled();
    });

    it('should not send owner email when owner preferences have notifyOnAuctionEnd=false', async () => {
      const owner = createUserFixture({ id: 1 });
      const auction = createAuctionFixture({ id: 1, status: AuctionStatus.ACTIVE, ownerId: 1, owner });

      redisService.getLivePrice.mockResolvedValue(200);
      redisService.getHighestBidderId.mockResolvedValue(null);
      mockTransactionWith(auction);
      usersService.findOneBy.mockResolvedValue(owner);
      userPreferencesService.findByUserId.mockResolvedValue(createUserPreferencesFixture({ notifyOnAuctionEnd: false }));

      await processor.process(createJob(1));
      await flushPromises();

      expect(mailService.sendAuctionOwnerEmail).not.toHaveBeenCalled();
    });

    it('should not send winner email when winner preferences have notifyOnAuctionEnd=false', async () => {
      const owner = createUserFixture({ id: 1 });
      const winner = createUserFixture({ id: 42 });
      const auction = createAuctionFixture({ id: 1, status: AuctionStatus.ACTIVE, ownerId: 1, owner });

      redisService.getLivePrice.mockResolvedValue(300);
      redisService.getHighestBidderId.mockResolvedValue(42);
      mockTransactionWith(auction);

      usersService.findOneBy.mockImplementation(({ id }: { id: number }) => Promise.resolve(id === 42 ? winner : owner));
      userPreferencesService.findByUserId.mockResolvedValue(createUserPreferencesFixture({ notifyOnAuctionEnd: false }));

      await processor.process(createJob(1));
      await flushPromises();

      expect(mailService.sendAuctionWinnerEmail).not.toHaveBeenCalled();
    });

    it('should not send owner email when owner is not found in DB', async () => {
      const owner = createUserFixture({ id: 1 });
      const auction = createAuctionFixture({ id: 1, status: AuctionStatus.ACTIVE, ownerId: 1, owner });

      redisService.getLivePrice.mockResolvedValue(100);
      redisService.getHighestBidderId.mockResolvedValue(null);
      mockTransactionWith(auction);
      usersService.findOneBy.mockResolvedValue(null);

      await processor.process(createJob(1));
      await flushPromises();

      expect(mailService.sendAuctionOwnerEmail).not.toHaveBeenCalled();
    });

    it('should log error and not throw when email sending fails', async () => {
      const owner = createUserFixture({ id: 1 });
      const auction = createAuctionFixture({ id: 1, status: AuctionStatus.ACTIVE, ownerId: 1, owner });

      redisService.getLivePrice.mockResolvedValue(100);
      redisService.getHighestBidderId.mockResolvedValue(null);
      mockTransactionWith(auction);
      usersService.findOneBy.mockResolvedValue(owner);
      userPreferencesService.findByUserId.mockResolvedValue(createUserPreferencesFixture({ notifyOnAuctionEnd: true }));
      mailService.sendAuctionOwnerEmail.mockRejectedValue(new Error('SMTP error'));

      await expect(processor.process(createJob(1))).resolves.not.toThrow();
      await flushPromises();

      expect(Logger.prototype.error).toHaveBeenCalledWith('Error sending notification in auction 1', expect.any(Error));
    });

    it('should not send emails when auction is already ENDED (dbUpdated=false)', async () => {
      const endedAuction = createAuctionFixture({ id: 1, status: AuctionStatus.ENDED });

      redisService.getLivePrice.mockResolvedValue(300);
      redisService.getHighestBidderId.mockResolvedValue(5);
      mockTransactionWith(endedAuction);

      await processor.process(createJob(1));
      await flushPromises();

      expect(mailService.sendAuctionOwnerEmail).not.toHaveBeenCalled();
      expect(mailService.sendAuctionWinnerEmail).not.toHaveBeenCalled();
    });
  });

  describe('idempotency — auction already ENDED in database', () => {
    it('should skip DB update but still clean up Redis and invalidate list cache when auction is already ENDED', async () => {
      const endedAuction = createAuctionFixture({ id: 1, status: AuctionStatus.ENDED });

      redisService.getLivePrice.mockResolvedValue(300);
      redisService.getHighestBidderId.mockResolvedValue(5);
      mockTransactionWith(endedAuction);

      await processor.process(createJob(1));

      expect(redisService.cleanupAuction).toHaveBeenCalledWith(1);
      expect(redisService.invalidateCache).toHaveBeenCalledWith('auctions:active:*');

      expect(bidGateway.notifyAuctionEnd).not.toHaveBeenCalled();

      expect(Logger.prototype.warn).toHaveBeenCalledWith('Auction 1 already marked as ENDED in DB — skipping DB update');
      expect(Logger.prototype.log).toHaveBeenCalledWith('Auction 1 Redis cleanup done (DB was already ENDED)');
    });

    it('should skip DB update and clean up Redis when auction is not found in DB', async () => {
      redisService.getLivePrice.mockResolvedValue(200);
      redisService.getHighestBidderId.mockResolvedValue(null);
      mockTransactionWith(null);

      await processor.process(createJob(99));

      expect(redisService.cleanupAuction).toHaveBeenCalledWith(99);
      expect(redisService.invalidateCache).toHaveBeenCalledWith('auctions:active:*');
      expect(bidGateway.notifyAuctionEnd).not.toHaveBeenCalled();
      expect(Logger.prototype.warn).toHaveBeenCalledWith('Auction 99 not found in DB during end processing');
    });
  });

  describe('error handling', () => {
    it('should propagate errors thrown by the database transaction', async () => {
      redisService.getLivePrice.mockResolvedValue(100);
      redisService.getHighestBidderId.mockResolvedValue(null);
      dataSource.transaction.mockRejectedValue(new Error('DB transaction failed'));

      await expect(processor.process(createJob(1))).rejects.toThrow('DB transaction failed');

      expect(redisService.cleanupAuction).not.toHaveBeenCalled();
      expect(bidGateway.notifyAuctionEnd).not.toHaveBeenCalled();
    });

    it('should propagate errors thrown by redisService.cleanupAuction', async () => {
      const auction = createAuctionFixture({ id: 1, status: AuctionStatus.ACTIVE });

      redisService.getLivePrice.mockResolvedValue(100);
      redisService.getHighestBidderId.mockResolvedValue(null);
      mockTransactionWith(auction);
      usersService.findOneBy.mockResolvedValue(createUserFixture({ id: 1 }));
      userPreferencesService.findByUserId.mockResolvedValue(createUserPreferencesFixture({ notifyOnAuctionEnd: false }));
      redisService.cleanupAuction.mockRejectedValue(new Error('Redis unavailable'));

      await expect(processor.process(createJob(1))).rejects.toThrow('Redis unavailable');

      expect(redisService.invalidateCache).not.toHaveBeenCalled();
      expect(bidGateway.notifyAuctionEnd).not.toHaveBeenCalled();
    });
  });
});
