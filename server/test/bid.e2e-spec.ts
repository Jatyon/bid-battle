/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import { INestApplication, Logger, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AppModule } from '@app/app.module';
import { AppConfigService } from '@config/config.service';
import { LoggingInterceptor, TimeoutInterceptor, TransformInterceptor } from '@core/interceptors';
import { HttpExceptionFilter } from '@core/filters/http-exception.filter';
import { UserToken } from '@modules/users/entities/user-token.entity';
import { Auction } from '@modules/auctions/entities/auction.entity';
import { User } from '@modules/users/entities/user.entity';
import { AuctionStatus } from '@modules/auctions/enums';
import { Bid } from '@modules/bid/entities/bid.entity';
import { BidSocketEvent } from '@modules/bid/enums';
import { MailConsumerService, MailService } from '@shared/mail';
import { RedisService } from '@shared/redis';
import { io as ioClient, Socket } from 'socket.io-client';
import type { AddressInfo, Server } from 'net';
import { I18nService } from 'nestjs-i18n';
import { In, Repository } from 'typeorm';
import { App } from 'supertest/types';
import * as bcrypt from 'bcrypt';
import request from 'supertest';

jest.mock('@css-inline/css-inline', () => ({
  inline: jest.fn((html: string): string => html),
}));

const waitForEvent = <T = unknown>(socket: Socket, event: BidSocketEvent | 'connect', timeoutMs = 4000): Promise<T> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for event: "${event}"`)), timeoutMs);
    socket.once(event, (data: T) => {
      clearTimeout(timer);
      resolve(data);
    });
  });

const connectSocket = (port: number, token?: string): Socket =>
  ioClient(`http://localhost:${port}/bid`, {
    transports: ['websocket'],
    forceNew: true,
    auth: token ? { token } : undefined,
    extraHeaders: token ? { Authorization: `Bearer ${token}` } : undefined,
  });

describe('Bid (e2e)', () => {
  let app: INestApplication<App>;
  let userRepository: Repository<User>;
  let userTokenRepository: Repository<UserToken>;
  let auctionRepository: Repository<Auction>;
  let bidRepository: Repository<Bid>;
  let configService: AppConfigService;
  let redisService: RedisService;
  let port: number;

  const OWNER_EMAIL = `e2e-bid-owner-${Date.now()}@test.com`;
  const BIDDER_EMAIL = `e2e-bid-bidder-${Date.now()}@test.com`;
  const SECOND_BIDDER_EMAIL = `e2e-bid-second-bidder-${Date.now()}@test.com`;
  const TEST_PASSWORD = 'Password123!';

  let ownerAccessToken: string;
  let bidderAccessToken: string;
  let secondBidderAccessToken: string;
  let ownerId: number;
  let bidderId: number;
  let secondBidderId: number;

  beforeAll(async () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(MailService)
      .useValue({
        sendEmailVerificationEmail: jest.fn().mockResolvedValue(undefined),
        sendForgotPasswordEmail: jest.fn().mockResolvedValue(undefined),
        sendPasswordChangedEmail: jest.fn().mockResolvedValue(undefined),
        sendAuctionWinnerEmail: jest.fn().mockResolvedValue(undefined),
        sendAuctionOwnerEmail: jest.fn().mockResolvedValue(undefined),
      })
      .overrideProvider(MailConsumerService)
      .useValue({
        onModuleInit: jest.fn(),
        process: jest.fn().mockResolvedValue(undefined),
      })
      .compile();

    app = moduleFixture.createNestApplication();

    configService = app.get(AppConfigService);
    redisService = app.get(RedisService);
    userRepository = moduleFixture.get(getRepositoryToken(User));
    userTokenRepository = moduleFixture.get(getRepositoryToken(UserToken));
    auctionRepository = moduleFixture.get(getRepositoryToken(Auction));
    bidRepository = moduleFixture.get(getRepositoryToken(Bid));

    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    app.useGlobalFilters(new HttpExceptionFilter(app.get(I18nService), configService));
    app.useGlobalInterceptors(app.get(LoggingInterceptor), new TransformInterceptor(), new TimeoutInterceptor(configService.app.timeoutMs));

    await app.listen(0);

    const server = app.getHttpServer() as Server;
    const address = server.address() as AddressInfo | null;

    port = address?.port ?? 3001;

    const salt = await bcrypt.genSalt(10);
    const ownerHash = await bcrypt.hash(TEST_PASSWORD, salt);
    const owner = userRepository.create({
      email: OWNER_EMAIL,
      firstName: 'Bid',
      lastName: 'Owner',
      password: ownerHash,
      isEmailVerified: true,
    });
    const savedOwner = await userRepository.save(owner);
    ownerId = savedOwner.id;

    const ownerLogin = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: OWNER_EMAIL, password: TEST_PASSWORD });
    ownerAccessToken = ownerLogin.body.data.accessToken;

    const bidderHash = await bcrypt.hash(TEST_PASSWORD, salt);
    const bidder = userRepository.create({
      email: BIDDER_EMAIL,
      firstName: 'Bid',
      lastName: 'Bidder',
      password: bidderHash,
      isEmailVerified: true,
    });
    const savedBidder = await userRepository.save(bidder);
    bidderId = savedBidder.id;

    const bidderLogin = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: BIDDER_EMAIL, password: TEST_PASSWORD });
    bidderAccessToken = bidderLogin.body.data.accessToken;

    const secondBidderHash = await bcrypt.hash(TEST_PASSWORD, salt);
    const secondBidder = userRepository.create({
      email: SECOND_BIDDER_EMAIL,
      firstName: 'Second',
      lastName: 'Bidder',
      password: secondBidderHash,
      isEmailVerified: true,
    });
    const savedSecondBidder = await userRepository.save(secondBidder);
    secondBidderId = savedSecondBidder.id;

    const secondBidderLogin = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: SECOND_BIDDER_EMAIL, password: TEST_PASSWORD });
    secondBidderAccessToken = secondBidderLogin.body.data.accessToken;
  });

  afterAll(async () => {
    const auctions = await auctionRepository.find({ where: { ownerId } });
    for (const auction of auctions) {
      await bidRepository.delete({ auctionId: auction.id });
    }
    if (auctions.length > 0) {
      await auctionRepository.delete(auctions.map((a) => a.id));
    }

    for (const email of [OWNER_EMAIL, BIDDER_EMAIL, SECOND_BIDDER_EMAIL]) {
      const user = await userRepository.findOneBy({ email });
      if (user) {
        await userTokenRepository.delete({ userId: user.id });
        await userRepository.delete({ id: user.id });
      }
    }

    await app.close();
  });

  // ════════════════════════════════════════════════════════════════
  // GET /api/v1/bids/my
  // ════════════════════════════════════════════════════════════════
  describe('GET /api/v1/bids/my', () => {
    it('should return 401 when not authenticated', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/bids/my').expect(401);

      expect(response.body).toHaveProperty('statusCode', 401);
    });

    it('should return paginated list of my bids (empty) when authenticated', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/bids/my').set('Authorization', `Bearer ${bidderAccessToken}`).expect(200);

      expect(response.body.data).toHaveProperty('items');
      expect(Array.isArray(response.body.data.items)).toBe(true);
      expect(response.body.data).toHaveProperty('total');
      expect(response.body.data).toHaveProperty('page', 1);
    });

    it('should return 400 when limit is out of allowed range', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/bids/my').set('Authorization', `Bearer ${bidderAccessToken}`).query({ limit: 999 }).expect(400);

      expect(response.body).toHaveProperty('statusCode', 400);
    });

    it('should return 401 when token is malformed', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/bids/my').set('Authorization', 'Bearer malformed.token.here').expect(401);

      expect(response.body).toHaveProperty('statusCode', 401);
    });

    it('should only return the highest bid per auction when user placed multiple bids on that auction', async () => {
      const auction = await auctionRepository.save(
        auctionRepository.create({
          title: 'Multiple Bids Test Auction',
          description: 'Testing only highest bid returned',
          startingPrice: 100,
          currentPrice: 200,
          startTime: new Date(),
          endTime: new Date(Date.now() + 2 * 60 * 60 * 1000),
          ownerId,
          status: AuctionStatus.ACTIVE,
          mainImageUrl: '2026/03/test.jpg',
        }),
      );

      const bid1 = await bidRepository.save(
        bidRepository.create({
          auctionId: auction.id,
          userId: bidderId,
          amount: 100,
        }),
      );

      const bid2 = await bidRepository.save(
        bidRepository.create({
          auctionId: auction.id,
          userId: bidderId,
          amount: 200,
        }),
      );

      const response = await request(app.getHttpServer()).get('/api/v1/bids/my').set('Authorization', `Bearer ${bidderAccessToken}`).expect(200);

      expect(response.body.data.total).toBe(1);
      expect(response.body.data.items).toHaveLength(1);
      expect(response.body.data.items[0].id).toBe(bid2.id);
      expect(response.body.data.items[0].amount).toBe(200);
      expect(response.body.data.items[0].auction.id).toBe(auction.id);

      await bidRepository.delete({ id: In([bid1.id, bid2.id]) });
      await auctionRepository.delete({ id: auction.id });
    });

    it('should correctly filter OUTBID vs WINNING and LOST vs WON when user had earlier lower bids', async () => {
      // 1. Active auction: bidder bid 100, second bidder bid 150, bidder re-bid 200 (currentPrice=200)
      const activeAuction = await auctionRepository.save(
        auctionRepository.create({
          title: 'Active Multi Bid Auction',
          description: 'Testing filter',
          startingPrice: 100,
          currentPrice: 200,
          startTime: new Date(),
          endTime: new Date(Date.now() + 2 * 60 * 60 * 1000),
          ownerId,
          status: AuctionStatus.ACTIVE,
          mainImageUrl: '2026/03/test.jpg',
        }),
      );

      const b1 = await bidRepository.save(bidRepository.create({ auctionId: activeAuction.id, userId: bidderId, amount: 100 }));
      const b2 = await bidRepository.save(bidRepository.create({ auctionId: activeAuction.id, userId: secondBidderId, amount: 150 }));
      const b3 = await bidRepository.save(bidRepository.create({ auctionId: activeAuction.id, userId: bidderId, amount: 200 }));

      // Filtering by OUTBID must NOT return this auction for bidder (because bidder's highest bid is 200 >= currentPrice 200)
      const outbidRes = await request(app.getHttpServer()).get('/api/v1/bids/my').query({ bidStatus: 'OUTBID' }).set('Authorization', `Bearer ${bidderAccessToken}`).expect(200);
      expect(outbidRes.body.data.items).toHaveLength(0);

      // Filtering by WINNING must return this auction for bidder
      const winningRes = await request(app.getHttpServer()).get('/api/v1/bids/my').query({ bidStatus: 'WINNING' }).set('Authorization', `Bearer ${bidderAccessToken}`).expect(200);
      expect(winningRes.body.data.items).toHaveLength(1);
      expect(winningRes.body.data.items[0].id).toBe(b3.id);

      // 2. Ended auction: bidder won at 200 (even if winnerId in DB is not set / null)
      const endedAuction = await auctionRepository.save(
        auctionRepository.create({
          title: 'Ended Multi Bid Auction',
          description: 'Testing filter',
          startingPrice: 100,
          currentPrice: 200,
          startTime: new Date(Date.now() - 4 * 60 * 60 * 1000),
          endTime: new Date(Date.now() - 2 * 60 * 60 * 1000),
          ownerId,
          status: AuctionStatus.ENDED,
          winnerId: null,
          mainImageUrl: '2026/03/test.jpg',
        }),
      );

      const eb1 = await bidRepository.save(bidRepository.create({ auctionId: endedAuction.id, userId: bidderId, amount: 100 }));
      const eb2 = await bidRepository.save(bidRepository.create({ auctionId: endedAuction.id, userId: bidderId, amount: 200 }));

      // Filtering by LOST must NOT return this auction for bidder
      const lostRes = await request(app.getHttpServer()).get('/api/v1/bids/my').query({ bidStatus: 'LOST' }).set('Authorization', `Bearer ${bidderAccessToken}`).expect(200);
      expect(lostRes.body.data.items).toHaveLength(0);

      // Filtering by WON must return this auction for bidder
      const wonRes = await request(app.getHttpServer()).get('/api/v1/bids/my').query({ bidStatus: 'WON' }).set('Authorization', `Bearer ${bidderAccessToken}`).expect(200);
      expect(wonRes.body.data.items).toHaveLength(1);
      expect(wonRes.body.data.items[0].id).toBe(eb2.id);

      await bidRepository.delete({ id: In([b1.id, b2.id, b3.id, eb1.id, eb2.id]) });
      await auctionRepository.delete({ id: In([activeAuction.id, endedAuction.id]) });
    });
  });

  // ════════════════════════════════════════════════════════════════
  // WebSocket Gateway /bid – connection
  // ════════════════════════════════════════════════════════════════
  describe('WebSocket /bid – connection', () => {
    it('should allow a guest to connect without a token', (done) => {
      const client = connectSocket(port);
      client.on('connect', () => {
        expect(client.connected).toBe(true);
        client.disconnect();
        done();
      });
      client.on('connect_error', (err) => {
        client.disconnect();
        done(err);
      });
    });

    it('should allow an authenticated user to connect with a JWT token', (done) => {
      const client = connectSocket(port, bidderAccessToken);
      client.on('connect', () => {
        expect(client.connected).toBe(true);
        client.disconnect();
        done();
      });
      client.on('connect_error', (err) => {
        client.disconnect();
        done(err);
      });
    });
  });

  // ════════════════════════════════════════════════════════════════
  // WebSocket – join:auction
  // ════════════════════════════════════════════════════════════════
  describe('WebSocket – join:auction', () => {
    let activeAuction: Auction;

    beforeAll(async () => {
      activeAuction = await auctionRepository.save(
        auctionRepository.create({
          title: 'WS Join Test Auction',
          description: 'Auction for websocket join testing',
          startingPrice: 100,
          currentPrice: 100,
          startTime: new Date(),
          endTime: new Date(Date.now() + 2 * 60 * 60 * 1000),
          ownerId,
          status: AuctionStatus.ACTIVE,
          mainImageUrl: '2026/03/test.jpg',
        }),
      );

      const durationSeconds = Math.floor((activeAuction.endTime.getTime() - Date.now()) / 1000);
      await redisService.initializeAuction(activeAuction.id, activeAuction.currentPrice, durationSeconds, ownerId);
    });

    afterAll(async () => {
      await redisService.cleanupAuction(activeAuction.id);
      await auctionRepository.delete({ id: activeAuction.id });
    });

    it('should emit joined:auction when a guest joins an active auction', async () => {
      const client = connectSocket(port);
      await waitForEvent(client, 'connect');

      client.emit(BidSocketEvent.JOIN_AUCTION, { auctionId: activeAuction.id });
      const response = await waitForEvent<Record<string, unknown>>(client, BidSocketEvent.JOINED_AUCTION);

      expect(response).toMatchObject({ auctionId: activeAuction.id });
      client.disconnect();
    });

    it('should emit joined:auction when an authenticated bidder joins an active auction', async () => {
      const client = connectSocket(port, bidderAccessToken);
      await waitForEvent(client, 'connect');

      client.emit(BidSocketEvent.JOIN_AUCTION, { auctionId: activeAuction.id });
      const response = await waitForEvent<Record<string, unknown>>(client, BidSocketEvent.JOINED_AUCTION);

      expect(response).toMatchObject({ auctionId: activeAuction.id });
      client.disconnect();
    });

    it('should emit exception with AUCTION_NOT_ACTIVE when the auction is not active', async () => {
      const inactiveAuction = await auctionRepository.save(
        auctionRepository.create({
          title: 'Inactive WS Auction',
          description: 'This auction is not active in Redis',
          startingPrice: 100,
          currentPrice: 100,
          startTime: new Date(),
          endTime: new Date(Date.now() + 1 * 60 * 60 * 1000),
          ownerId,
          status: AuctionStatus.PENDING,
          mainImageUrl: '2026/03/test.jpg',
        }),
      );

      const client = connectSocket(port);
      await waitForEvent(client, 'connect');

      client.emit(BidSocketEvent.JOIN_AUCTION, { auctionId: inactiveAuction.id });
      const response = await waitForEvent<Record<string, unknown>>(client, BidSocketEvent.AUCTION_ENDED);

      expect(response).toMatchObject({ auctionId: inactiveAuction.id });
      client.disconnect();

      await auctionRepository.delete({ id: inactiveAuction.id });
    });

    it('should emit exception when auctionId is invalid (= 0)', async () => {
      const client = connectSocket(port);
      await waitForEvent(client, 'connect');

      client.emit(BidSocketEvent.JOIN_AUCTION, { auctionId: 0 });
      const response = await waitForEvent<Record<string, unknown>>(client, BidSocketEvent.EXCEPTION);

      expect(response).toBeDefined();
      client.disconnect();
    });
  });

  // ════════════════════════════════════════════════════════════════
  // WebSocket – leave:auction
  // ════════════════════════════════════════════════════════════════
  describe('WebSocket – leave:auction', () => {
    let activeAuction: Auction;

    beforeAll(async () => {
      activeAuction = await auctionRepository.save(
        auctionRepository.create({
          title: 'WS Leave Test Auction',
          description: 'Auction for websocket leave testing',
          startingPrice: 100,
          currentPrice: 100,
          startTime: new Date(),
          endTime: new Date(Date.now() + 2 * 60 * 60 * 1000),
          ownerId,
          status: AuctionStatus.ACTIVE,
          mainImageUrl: '2026/03/test.jpg',
        }),
      );

      const durationSeconds = Math.floor((activeAuction.endTime.getTime() - Date.now()) / 1000);
      await redisService.initializeAuction(activeAuction.id, activeAuction.currentPrice, durationSeconds, ownerId);
    });

    afterAll(async () => {
      await redisService.cleanupAuction(activeAuction.id);
      await auctionRepository.delete({ id: activeAuction.id });
    });

    it('should emit left:auction when a guest leaves the room', async () => {
      const client = connectSocket(port);
      await waitForEvent(client, 'connect');

      client.emit(BidSocketEvent.JOIN_AUCTION, { auctionId: activeAuction.id });
      await waitForEvent(client, BidSocketEvent.JOINED_AUCTION);

      client.emit(BidSocketEvent.LEAVE_AUCTION, { auctionId: activeAuction.id });
      const response = await waitForEvent<Record<string, unknown>>(client, BidSocketEvent.LEFT_AUCTION);

      expect(response).toMatchObject({ auctionId: activeAuction.id });
      client.disconnect();
    });

    it('should emit left:auction when an authenticated bidder leaves the room', async () => {
      const client = connectSocket(port, bidderAccessToken);
      await waitForEvent(client, 'connect');

      client.emit(BidSocketEvent.JOIN_AUCTION, { auctionId: activeAuction.id });
      await waitForEvent(client, BidSocketEvent.JOINED_AUCTION);

      client.emit(BidSocketEvent.LEAVE_AUCTION, { auctionId: activeAuction.id });
      const response = await waitForEvent<Record<string, unknown>>(client, BidSocketEvent.LEFT_AUCTION);

      expect(response).toMatchObject({ auctionId: activeAuction.id });
      client.disconnect();
    });
  });

  // ════════════════════════════════════════════════════════════════
  // WebSocket – request:current:state
  // ════════════════════════════════════════════════════════════════
  describe('WebSocket – request:current:state', () => {
    let activeAuction: Auction;

    beforeAll(async () => {
      activeAuction = await auctionRepository.save(
        auctionRepository.create({
          title: 'WS State Test Auction',
          description: 'Auction for websocket state testing',
          startingPrice: 300,
          currentPrice: 300,
          startTime: new Date(),
          endTime: new Date(Date.now() + 2 * 60 * 60 * 1000),
          ownerId,
          status: AuctionStatus.ACTIVE,
          mainImageUrl: '2026/03/test.jpg',
        }),
      );

      const durationSeconds = Math.floor((activeAuction.endTime.getTime() - Date.now()) / 1000);
      await redisService.initializeAuction(activeAuction.id, activeAuction.currentPrice, durationSeconds, ownerId);
    });

    afterAll(async () => {
      await redisService.cleanupAuction(activeAuction.id);
      await auctionRepository.delete({ id: activeAuction.id });
    });

    it('should emit current:state with NOT_IN_AUCTION_ROOM when client has not joined any room', async () => {
      const client = connectSocket(port);
      await waitForEvent(client, 'connect');

      client.emit(BidSocketEvent.REQUEST_CURRENT_STATE);
      const response = await waitForEvent<Record<string, unknown>>(client, BidSocketEvent.EXCEPTION);

      expect(response).toMatchObject({ code: 'NOT_IN_AUCTION_ROOM' });
      client.disconnect();
    });

    it('should emit current:state with auction data after a guest joins', async () => {
      const client = connectSocket(port);
      await waitForEvent(client, 'connect');

      client.emit(BidSocketEvent.JOIN_AUCTION, { auctionId: activeAuction.id });
      await waitForEvent(client, BidSocketEvent.JOINED_AUCTION);

      client.emit(BidSocketEvent.REQUEST_CURRENT_STATE);
      const response = await waitForEvent<Record<string, unknown>>(client, BidSocketEvent.CURRENT_STATE);

      expect(response).toMatchObject({
        auctionId: activeAuction.id,
        isActive: true,
        isLeading: false,
      });
      expect(response).toHaveProperty('currentPrice');
      expect(response).toHaveProperty('participantsCount');
      client.disconnect();
    });

    it('should emit current:state with auction data for an authenticated bidder', async () => {
      const client = connectSocket(port, bidderAccessToken);
      await waitForEvent(client, 'connect');

      client.emit(BidSocketEvent.JOIN_AUCTION, { auctionId: activeAuction.id });
      await waitForEvent(client, BidSocketEvent.JOINED_AUCTION);

      client.emit(BidSocketEvent.REQUEST_CURRENT_STATE);
      const response = await waitForEvent<Record<string, unknown>>(client, BidSocketEvent.CURRENT_STATE);

      expect(response).toMatchObject({
        auctionId: activeAuction.id,
        isActive: true,
        isLeading: false,
      });
      client.disconnect();
    });
  });

  // ════════════════════════════════════════════════════════════════
  // WebSocket – place:bid
  // ════════════════════════════════════════════════════════════════
  describe('WebSocket – place:bid', () => {
    let activeAuction: Auction;

    beforeEach(async () => {
      activeAuction = await auctionRepository.save(
        auctionRepository.create({
          title: `WS Bid Test Auction ${Date.now()}`,
          description: 'Auction for websocket bid testing',
          startingPrice: 100,
          currentPrice: 100,
          startTime: new Date(),
          endTime: new Date(Date.now() + 2 * 60 * 60 * 1000),
          ownerId,
          status: AuctionStatus.ACTIVE,
          mainImageUrl: '2026/03/test.jpg',
        }),
      );

      const durationSeconds = Math.floor((activeAuction.endTime.getTime() - Date.now()) / 1000);
      await redisService.initializeAuction(activeAuction.id, activeAuction.currentPrice, durationSeconds, ownerId);
    });

    afterEach(async () => {
      await redisService.cleanupAuction(activeAuction.id);
      await bidRepository.delete({ auctionId: activeAuction.id });
      await auctionRepository.delete({ id: activeAuction.id });
    });

    it('should emit exception when a guest (no token) attempts to place a bid', async () => {
      const client = connectSocket(port);
      await waitForEvent(client, 'connect');

      client.emit(BidSocketEvent.PLACE_BID, { amount: 200 });
      const response = await waitForEvent<Record<string, unknown>>(client, BidSocketEvent.EXCEPTION);

      expect(response).toBeDefined();
      client.disconnect();
    });

    it('should emit bid:rejected with NOT_IN_AUCTION_ROOM when bidder has not joined a room', async () => {
      const client = connectSocket(port, bidderAccessToken);
      await waitForEvent(client, 'connect');

      client.emit(BidSocketEvent.PLACE_BID, { amount: 200 });
      const response = await waitForEvent<Record<string, unknown>>(client, BidSocketEvent.BID_REJECTED);

      expect(response).toMatchObject({ code: 'NOT_IN_AUCTION_ROOM' });
      client.disconnect();
    });

    it('should emit bid:rejected with OWNER_CANNOT_BID when the auction owner tries to bid', async () => {
      const client = connectSocket(port, ownerAccessToken);
      await waitForEvent(client, 'connect');

      client.emit(BidSocketEvent.JOIN_AUCTION, { auctionId: activeAuction.id });
      await waitForEvent(client, BidSocketEvent.JOINED_AUCTION);

      client.emit(BidSocketEvent.PLACE_BID, { amount: 200 });
      const response = await waitForEvent<Record<string, unknown>>(client, BidSocketEvent.BID_REJECTED);

      expect(response).toMatchObject({ code: 'OWNER_CANNOT_BID' });
      client.disconnect();
    });

    it('should emit bid:rejected with BID_TOO_LOW when the bid amount is below the minimum', async () => {
      const client = connectSocket(port, bidderAccessToken);
      await waitForEvent(client, 'connect');

      client.emit(BidSocketEvent.JOIN_AUCTION, { auctionId: activeAuction.id });
      await waitForEvent(client, BidSocketEvent.JOINED_AUCTION);

      client.emit(BidSocketEvent.PLACE_BID, { amount: 1 });
      const response = await waitForEvent<Record<string, unknown>>(client, BidSocketEvent.BID_REJECTED);

      expect(response).toMatchObject({ code: 'BID_TOO_LOW' });
      expect(response).toHaveProperty('currentPrice');
      expect(response).toHaveProperty('minNextBid');
      client.disconnect();
    });

    it('should broadcast new:highest:bid to the room after a successful bid', async () => {
      const client = connectSocket(port, bidderAccessToken);
      await waitForEvent(client, 'connect');

      client.emit(BidSocketEvent.JOIN_AUCTION, { auctionId: activeAuction.id });
      await waitForEvent(client, BidSocketEvent.JOINED_AUCTION);

      client.emit(BidSocketEvent.PLACE_BID, { amount: 200 });
      const response = await waitForEvent<Record<string, unknown>>(client, BidSocketEvent.NEW_HIGHEST_BID);

      expect(response).toMatchObject({ auctionId: activeAuction.id, amount: 200 });

      const savedBid = await bidRepository.findOne({ where: { auctionId: activeAuction.id, userId: bidderId } });
      expect(savedBid).not.toBeNull();
      expect(savedBid?.amount).toBe(200);

      const updatedAuction = await auctionRepository.findOne({ where: { id: activeAuction.id } });
      expect(updatedAuction).not.toBeNull();
      expect(updatedAuction?.currentPrice).toBe(200);

      client.disconnect();
    });

    it('should emit bid:rejected with ALREADY_LEADING when the same bidder tries to outbid themselves', async () => {
      const client = connectSocket(port, bidderAccessToken);
      await waitForEvent(client, 'connect');

      client.emit(BidSocketEvent.JOIN_AUCTION, { auctionId: activeAuction.id });
      await waitForEvent(client, BidSocketEvent.JOINED_AUCTION);

      client.emit(BidSocketEvent.PLACE_BID, { amount: 200 });
      await waitForEvent(client, BidSocketEvent.NEW_HIGHEST_BID);

      client.emit(BidSocketEvent.PLACE_BID, { amount: 300 });
      const response = await waitForEvent<Record<string, unknown>>(client, BidSocketEvent.BID_REJECTED);

      expect(response).toMatchObject({ code: 'ALREADY_LEADING' });
      client.disconnect();
    });

    it('should correctly handle 2 users bidding concurrently with the same amount: one succeeds and one receives OUTBID', async () => {
      const client1 = connectSocket(port, bidderAccessToken);
      const client2 = connectSocket(port, secondBidderAccessToken);

      await Promise.all([waitForEvent(client1, 'connect'), waitForEvent(client2, 'connect')]);

      client1.emit(BidSocketEvent.JOIN_AUCTION, { auctionId: activeAuction.id });
      client2.emit(BidSocketEvent.JOIN_AUCTION, { auctionId: activeAuction.id });

      await Promise.all([waitForEvent(client1, BidSocketEvent.JOINED_AUCTION), waitForEvent(client2, BidSocketEvent.JOINED_AUCTION)]);

      // Both users bid 200 at the same time
      client1.emit(BidSocketEvent.PLACE_BID, { amount: 200 });
      client2.emit(BidSocketEvent.PLACE_BID, { amount: 200 });

      // One must receive 'new:highest:bid', and the other must receive 'bid:rejected' with code 'OUTBID'
      const client1Events = new Promise<string>((resolve) => {
        client1.once(BidSocketEvent.NEW_HIGHEST_BID, () => resolve('success'));
        client1.once(BidSocketEvent.BID_REJECTED, (data: any) => resolve(`rejected:${data.code}`));
      });
      const client2Events = new Promise<string>((resolve) => {
        client2.once(BidSocketEvent.NEW_HIGHEST_BID, () => resolve('success'));
        client2.once(BidSocketEvent.BID_REJECTED, (data: any) => resolve(`rejected:${data.code}`));
      });

      const [res1, res2] = await Promise.all([client1Events, client2Events]);

      const results = [res1, res2].sort();
      expect(results).toEqual(['rejected:OUTBID', 'success']);

      // Only exactly 1 bid in the database
      const bids = await bidRepository.find({ where: { auctionId: activeAuction.id } });
      expect(bids.length).toBe(1);
      expect(bids[0].amount).toBe(200);

      client1.disconnect();
      client2.disconnect();
    });
  });

  // ════════════════════════════════════════════════════════════════
  // WebSocket – rejoin:auction
  // ════════════════════════════════════════════════════════════════
  describe('WebSocket – rejoin:auction', () => {
    let activeAuction: Auction;

    beforeAll(async () => {
      activeAuction = await auctionRepository.save(
        auctionRepository.create({
          title: 'WS Rejoin Test Auction',
          description: 'Auction for websocket rejoin testing',
          startingPrice: 100,
          currentPrice: 100,
          startTime: new Date(),
          endTime: new Date(Date.now() + 2 * 60 * 60 * 1000),
          ownerId,
          status: AuctionStatus.ACTIVE,
          mainImageUrl: '2026/03/test.jpg',
        }),
      );

      const durationSeconds = Math.floor((activeAuction.endTime.getTime() - Date.now()) / 1000);
      await redisService.initializeAuction(activeAuction.id, activeAuction.currentPrice, durationSeconds, ownerId);
    });

    afterAll(async () => {
      await redisService.cleanupAuction(activeAuction.id);
      await auctionRepository.delete({ id: activeAuction.id });
    });

    it('should emit rejoined:auction for a guest joining an active auction', async () => {
      const client = connectSocket(port);
      await waitForEvent(client, 'connect');

      client.emit(BidSocketEvent.REJOIN_AUCTION, { auctionId: activeAuction.id });
      const response = await waitForEvent<Record<string, unknown>>(client, BidSocketEvent.REJOINED_AUCTION);

      expect(response).toMatchObject({ auctionId: activeAuction.id });
      expect(response).toHaveProperty('isActive', true);
      client.disconnect();
    });

    it('should emit rejoined:auction for an authenticated bidder', async () => {
      const client = connectSocket(port, bidderAccessToken);
      await waitForEvent(client, 'connect');

      client.emit(BidSocketEvent.REJOIN_AUCTION, { auctionId: activeAuction.id });
      const response = await waitForEvent<Record<string, unknown>>(client, BidSocketEvent.REJOINED_AUCTION);

      expect(response).toMatchObject({ auctionId: activeAuction.id });
      expect(response).toHaveProperty('isActive', true);
      client.disconnect();
    });

    it('should emit auction:ended when the auction is no longer active on rejoin', async () => {
      const inactiveAuction = await auctionRepository.save(
        auctionRepository.create({
          title: 'Inactive Rejoin Auction',
          description: 'This auction is not active in Redis',
          startingPrice: 100,
          currentPrice: 100,
          startTime: new Date(),
          endTime: new Date(Date.now() + 1 * 60 * 60 * 1000),
          ownerId,
          status: AuctionStatus.ENDED,
          mainImageUrl: '2026/03/test.jpg',
        }),
      );

      const client = connectSocket(port);
      await waitForEvent(client, 'connect');

      client.emit(BidSocketEvent.REJOIN_AUCTION, { auctionId: inactiveAuction.id });
      const response = await waitForEvent<Record<string, unknown>>(client, BidSocketEvent.AUCTION_ENDED);

      expect(response).toMatchObject({ auctionId: inactiveAuction.id });
      client.disconnect();

      await auctionRepository.delete({ id: inactiveAuction.id });
    });
  });
});
