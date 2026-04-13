/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import { INestApplication, Logger, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AppModule } from '@app/app.module';
import { AppConfigService } from '@config/config.service';
import { LoggingInterceptor, TimeoutInterceptor, TransformInterceptor } from '@core/interceptors';
import { HttpExceptionFilter } from '@core/filters/http-exception.filter';
import { Auction } from '@modules/auctions/entities/auction.entity';
import { AuctionStatus } from '@modules/auctions/enums';
import { Bid } from '@modules/bid/entities/bid.entity';
import { UserToken } from '@modules/users/entities/user-token.entity';
import { User } from '@modules/users/entities/user.entity';
import { MailConsumerService, MailService } from '@shared/mail';
import { RedisService } from '@shared/redis';
import { io as ioClient, Socket } from 'socket.io-client';
import { I18nService } from 'nestjs-i18n';
import type { AddressInfo, Server } from 'net';
import { App } from 'supertest/types';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import request from 'supertest';

jest.mock('@css-inline/css-inline', () => ({
  inline: jest.fn((html: string): string => html),
}));

const waitForEvent = <T = unknown>(socket: Socket, event: string, timeoutMs = 4000): Promise<T> =>
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
  const TEST_PASSWORD = 'Password123!';

  let ownerAccessToken: string;
  let bidderAccessToken: string;
  let ownerId: number;
  let bidderId: number;

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
    app.useGlobalInterceptors(new LoggingInterceptor(), new TransformInterceptor(), new TimeoutInterceptor(configService.app.timeoutMs));

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
  });

  afterAll(async () => {
    const auctions = await auctionRepository.find({ where: { ownerId } });
    for (const auction of auctions) {
      await bidRepository.delete({ auctionId: auction.id });
    }
    if (auctions.length > 0) {
      await auctionRepository.delete(auctions.map((a) => a.id));
    }

    for (const email of [OWNER_EMAIL, BIDDER_EMAIL]) {
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

      client.emit('join:auction', { auctionId: activeAuction.id });
      const response = await waitForEvent<Record<string, unknown>>(client, 'joined:auction');

      expect(response).toMatchObject({ auctionId: activeAuction.id });
      client.disconnect();
    });

    it('should emit joined:auction when an authenticated bidder joins an active auction', async () => {
      const client = connectSocket(port, bidderAccessToken);
      await waitForEvent(client, 'connect');

      client.emit('join:auction', { auctionId: activeAuction.id });
      const response = await waitForEvent<Record<string, unknown>>(client, 'joined:auction');

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

      client.emit('join:auction', { auctionId: inactiveAuction.id });
      const response = await waitForEvent<Record<string, unknown>>(client, 'exception');

      expect(response).toMatchObject({ code: 'AUCTION_NOT_ACTIVE' });
      client.disconnect();

      await auctionRepository.delete({ id: inactiveAuction.id });
    });

    it('should emit exception when auctionId is invalid (= 0)', async () => {
      const client = connectSocket(port);
      await waitForEvent(client, 'connect');

      client.emit('join:auction', { auctionId: 0 });
      const response = await waitForEvent<Record<string, unknown>>(client, 'exception');

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

      client.emit('join:auction', { auctionId: activeAuction.id });
      await waitForEvent(client, 'joined:auction');

      client.emit('leave:auction', { auctionId: activeAuction.id });
      const response = await waitForEvent<Record<string, unknown>>(client, 'left:auction');

      expect(response).toMatchObject({ auctionId: activeAuction.id });
      client.disconnect();
    });

    it('should emit left:auction when an authenticated bidder leaves the room', async () => {
      const client = connectSocket(port, bidderAccessToken);
      await waitForEvent(client, 'connect');

      client.emit('join:auction', { auctionId: activeAuction.id });
      await waitForEvent(client, 'joined:auction');

      client.emit('leave:auction', { auctionId: activeAuction.id });
      const response = await waitForEvent<Record<string, unknown>>(client, 'left:auction');

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

      client.emit('request:current:state');
      const response = await waitForEvent<Record<string, unknown>>(client, 'current:state');

      expect(response).toMatchObject({ code: 'NOT_IN_AUCTION_ROOM' });
      client.disconnect();
    });

    it('should emit current:state with auction data after a guest joins', async () => {
      const client = connectSocket(port);
      await waitForEvent(client, 'connect');

      client.emit('join:auction', { auctionId: activeAuction.id });
      await waitForEvent(client, 'joined:auction');

      client.emit('request:current:state');
      const response = await waitForEvent<Record<string, unknown>>(client, 'current:state');

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

      client.emit('join:auction', { auctionId: activeAuction.id });
      await waitForEvent(client, 'joined:auction');

      client.emit('request:current:state');
      const response = await waitForEvent<Record<string, unknown>>(client, 'current:state');

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

      client.emit('place:bid', { amount: 200 });
      const response = await waitForEvent<Record<string, unknown>>(client, 'exception');

      expect(response).toBeDefined();
      client.disconnect();
    });

    it('should emit bid:rejected with NOT_IN_AUCTION_ROOM when bidder has not joined a room', async () => {
      const client = connectSocket(port, bidderAccessToken);
      await waitForEvent(client, 'connect');

      client.emit('place:bid', { amount: 200 });
      const response = await waitForEvent<Record<string, unknown>>(client, 'bid:rejected');

      expect(response).toMatchObject({ code: 'NOT_IN_AUCTION_ROOM' });
      client.disconnect();
    });

    it('should emit bid:rejected with OWNER_CANNOT_BID when the auction owner tries to bid', async () => {
      const client = connectSocket(port, ownerAccessToken);
      await waitForEvent(client, 'connect');

      client.emit('join:auction', { auctionId: activeAuction.id });
      await waitForEvent(client, 'joined:auction');

      client.emit('place:bid', { amount: 200 });
      const response = await waitForEvent<Record<string, unknown>>(client, 'bid:rejected');

      expect(response).toMatchObject({ code: 'OWNER_CANNOT_BID' });
      client.disconnect();
    });

    it('should emit bid:rejected with BID_TOO_LOW when the bid amount is below the minimum', async () => {
      const client = connectSocket(port, bidderAccessToken);
      await waitForEvent(client, 'connect');

      client.emit('join:auction', { auctionId: activeAuction.id });
      await waitForEvent(client, 'joined:auction');

      client.emit('place:bid', { amount: 1 });
      const response = await waitForEvent<Record<string, unknown>>(client, 'bid:rejected');

      expect(response).toMatchObject({ code: 'BID_TOO_LOW' });
      expect(response).toHaveProperty('currentPrice');
      expect(response).toHaveProperty('minNextBid');
      client.disconnect();
    });

    it('should broadcast new:highest:bid to the room after a successful bid', async () => {
      const client = connectSocket(port, bidderAccessToken);
      await waitForEvent(client, 'connect');

      client.emit('join:auction', { auctionId: activeAuction.id });
      await waitForEvent(client, 'joined:auction');

      client.emit('place:bid', { amount: 200 });
      const response = await waitForEvent<Record<string, unknown>>(client, 'new:highest:bid');

      expect(response).toMatchObject({ auctionId: activeAuction.id, amount: 200 });

      const savedBid = await bidRepository.findOne({ where: { auctionId: activeAuction.id, userId: bidderId } });
      expect(savedBid).not.toBeNull();
      expect(savedBid?.amount).toBe(200);

      client.disconnect();
    });

    it('should emit bid:rejected with ALREADY_LEADING when the same bidder tries to outbid themselves', async () => {
      const client = connectSocket(port, bidderAccessToken);
      await waitForEvent(client, 'connect');

      client.emit('join:auction', { auctionId: activeAuction.id });
      await waitForEvent(client, 'joined:auction');

      client.emit('place:bid', { amount: 200 });
      await waitForEvent(client, 'new:highest:bid');

      client.emit('place:bid', { amount: 300 });
      const response = await waitForEvent<Record<string, unknown>>(client, 'bid:rejected');

      expect(response).toMatchObject({ code: 'ALREADY_LEADING' });
      client.disconnect();
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

      client.emit('rejoin:auction', { auctionId: activeAuction.id });
      const response = await waitForEvent<Record<string, unknown>>(client, 'rejoined:auction');

      expect(response).toMatchObject({ auctionId: activeAuction.id });
      expect(response).toHaveProperty('isActive', true);
      client.disconnect();
    });

    it('should emit rejoined:auction for an authenticated bidder', async () => {
      const client = connectSocket(port, bidderAccessToken);
      await waitForEvent(client, 'connect');

      client.emit('rejoin:auction', { auctionId: activeAuction.id });
      const response = await waitForEvent<Record<string, unknown>>(client, 'rejoined:auction');

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

      client.emit('rejoin:auction', { auctionId: inactiveAuction.id });
      const response = await waitForEvent<Record<string, unknown>>(client, 'auction:ended');

      expect(response).toMatchObject({ auctionId: inactiveAuction.id });
      client.disconnect();

      await auctionRepository.delete({ id: inactiveAuction.id });
    });
  });
});
