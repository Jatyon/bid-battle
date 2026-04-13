/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import { INestApplication, Logger, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AppModule } from '@app/app.module';
import { AppConfigService } from '@config/config.service';
import { LoggingInterceptor, TimeoutInterceptor, TransformInterceptor } from '@core/interceptors';
import { HttpExceptionFilter } from '@core/filters/http-exception.filter';
import { AuctionStatus } from '@modules/auctions/enums';
import { Auction } from '@modules/auctions/entities/auction.entity';
import { AuctionImage } from '@modules/auctions/entities/auction-images.entity';
import { UserToken } from '@modules/users/entities/user-token.entity';
import { User } from '@modules/users/entities/user.entity';
import { MailConsumerService, MailService } from '@shared/mail';
import { I18nService } from 'nestjs-i18n';
import { App } from 'supertest/types';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import request from 'supertest';

jest.mock('@css-inline/css-inline', () => ({
  inline: jest.fn((html: string): string => html),
}));

describe('Auctions (e2e)', () => {
  let app: INestApplication<App>;
  let userRepository: Repository<User>;
  let userTokenRepository: Repository<UserToken>;
  let auctionRepository: Repository<Auction>;
  let auctionImageRepository: Repository<AuctionImage>;
  let configService: AppConfigService;

  const TEST_EMAIL = `e2e-auctions-owner-${Date.now()}@test.com`;
  const OTHER_EMAIL = `e2e-auctions-other-${Date.now()}@test.com`;
  const TEST_PASSWORD = 'Password123!';

  let ownerAccessToken: string;
  let otherAccessToken: string;
  let ownerId: number;

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
    userRepository = moduleFixture.get(getRepositoryToken(User));
    userTokenRepository = moduleFixture.get(getRepositoryToken(UserToken));
    auctionRepository = moduleFixture.get(getRepositoryToken(Auction));
    auctionImageRepository = moduleFixture.get(getRepositoryToken(AuctionImage));

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

    await app.init();

    // Utwórz właściciela aukcji
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(TEST_PASSWORD, salt);

    const owner = userRepository.create({
      email: TEST_EMAIL,
      firstName: 'Auction',
      lastName: 'Owner',
      password: hash,
      isEmailVerified: true,
    });
    const savedOwner = await userRepository.save(owner);
    ownerId = savedOwner.id;

    const ownerLogin = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: TEST_EMAIL, password: TEST_PASSWORD });
    ownerAccessToken = ownerLogin.body.data.accessToken;

    // Utwórz drugiego użytkownika
    const otherHash = await bcrypt.hash(TEST_PASSWORD, salt);
    const other = userRepository.create({
      email: OTHER_EMAIL,
      firstName: 'Other',
      lastName: 'User',
      password: otherHash,
      isEmailVerified: true,
    });
    await userRepository.save(other);

    const otherLogin = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: OTHER_EMAIL, password: TEST_PASSWORD });
    otherAccessToken = otherLogin.body.data.accessToken;
  });

  afterAll(async () => {
    // Usuń aukcje i powiązane obrazy właściciela
    const auctions = await auctionRepository.find({ where: { ownerId } });
    for (const auction of auctions) {
      await auctionImageRepository.delete({ auctionId: auction.id });
    }
    if (auctions.length > 0) {
      await auctionRepository.delete(auctions.map((a) => a.id));
    }

    // Usuń użytkowników testowych
    for (const email of [TEST_EMAIL, OTHER_EMAIL]) {
      const user = await userRepository.findOneBy({ email });
      if (user) {
        await userTokenRepository.delete({ userId: user.id });
        await userRepository.delete({ id: user.id });
      }
    }

    await app.close();
  });

  // ════════════════════════════════════════════════════════════════
  // GET /api/v1/auctions
  // ════════════════════════════════════════════════════════════════
  describe('GET /api/v1/auctions', () => {
    it('should return paginated list of active auctions without authentication', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/auctions').expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('items');
      expect(Array.isArray(response.body.data.items)).toBe(true);
      expect(response.body.data).toHaveProperty('total');
      expect(response.body.data).toHaveProperty('page');
      expect(response.body.data).toHaveProperty('limit');
    });

    it('should return 200 with valid pagination params', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/auctions').query({ page: 1, limit: 10 }).expect(200);

      expect(response.body.data).toHaveProperty('items');
      expect(response.body.data.limit).toBe(10);
      expect(response.body.data.page).toBe(1);
    });

    it('should return 400 when limit exceeds maximum', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/auctions').query({ limit: 999 }).expect(400);

      expect(response.body).toHaveProperty('statusCode', 400);
    });

    it('should return 400 when category is invalid', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/auctions').query({ category: 'INVALID_CATEGORY' }).expect(400);

      expect(response.body).toHaveProperty('statusCode', 400);
    });

    it('should return 400 when minPrice is negative', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/auctions').query({ minPrice: -1 }).expect(400);

      expect(response.body).toHaveProperty('statusCode', 400);
    });
  });

  // ════════════════════════════════════════════════════════════════
  // POST /api/v1/auctions
  // ════════════════════════════════════════════════════════════════
  describe('POST /api/v1/auctions', () => {
    const validPayload = {
      title: 'E2E Test Auction',
      description: 'E2E test auction description with sufficient length',
      startingPrice: 1000,
      endTime: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      imageUrls: ['2026/03/test-image.jpg'],
      primaryImageIndex: 0,
    };

    it('should return 401 when not authenticated', async () => {
      const response = await request(app.getHttpServer()).post('/api/v1/auctions').send(validPayload).expect(401);

      expect(response.body).toHaveProperty('statusCode', 401);
    });

    it('should return 400 when required fields are missing', async () => {
      const response = await request(app.getHttpServer()).post('/api/v1/auctions').set('Authorization', `Bearer ${ownerAccessToken}`).send({ title: 'Only title' }).expect(400);

      expect(response.body).toHaveProperty('statusCode', 400);
    });

    it('should return 400 when endTime is in the past', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auctions')
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({ ...validPayload, endTime: new Date(Date.now() - 1000).toISOString() })
        .expect(400);

      expect(response.body).toHaveProperty('statusCode', 400);
    });

    it('should return 400 when startingPrice is zero', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auctions')
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({ ...validPayload, startingPrice: 0 })
        .expect(400);

      expect(response.body).toHaveProperty('statusCode', 400);
    });

    it('should return 400 when startingPrice is negative', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auctions')
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({ ...validPayload, startingPrice: -10 })
        .expect(400);

      expect(response.body).toHaveProperty('statusCode', 400);
    });

    it('should return 400 when title exceeds max length', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auctions')
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({ ...validPayload, title: 'A'.repeat(256) })
        .expect(400);

      expect(response.body).toHaveProperty('statusCode', 400);
    });

    it('should return 400 when extra fields are sent (forbidNonWhitelisted)', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auctions')
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({ ...validPayload, unknownField: 'hack' })
        .expect(400);

      expect(response.body).toHaveProperty('statusCode', 400);
    });

    it('should create a new auction and return it', async () => {
      const payload = {
        title: `E2E Auction ${Date.now()}`,
        description: 'E2E test auction description with sufficient length for the test',
        startingPrice: 500,
        endTime: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
        imageUrls: ['2026/03/test-image.jpg'],
        primaryImageIndex: 0,
      };

      const response = await request(app.getHttpServer()).post('/api/v1/auctions').set('Authorization', `Bearer ${ownerAccessToken}`).send(payload).expect(200);

      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data).toHaveProperty('title', payload.title);
      expect(response.body.data).toHaveProperty('startingPrice', payload.startingPrice);
      expect(response.body.data).toHaveProperty('status', AuctionStatus.PENDING);

      // Cleanup
      await auctionImageRepository.delete({ auctionId: response.body.data.id });
      await auctionRepository.delete({ id: response.body.data.id });
    });
  });

  // ════════════════════════════════════════════════════════════════
  // GET /api/v1/auctions/:id
  // ════════════════════════════════════════════════════════════════
  describe('GET /api/v1/auctions/:id', () => {
    let auctionId: number;

    beforeAll(async () => {
      const auction = auctionRepository.create({
        title: 'Detail Test Auction',
        description: 'Auction for detail endpoint testing',
        startingPrice: 200,
        currentPrice: 200,
        startTime: new Date(),
        endTime: new Date(Date.now() + 2 * 60 * 60 * 1000),
        ownerId,
        status: AuctionStatus.ACTIVE,
        mainImageUrl: '/uploads/2026/03/test.jpg',
      });
      const saved = await auctionRepository.save(auction);
      auctionId = saved.id;
    });

    afterAll(async () => {
      await auctionImageRepository.delete({ auctionId });
      await auctionRepository.delete({ id: auctionId });
    });

    it('should return auction details for guest', async () => {
      const response = await request(app.getHttpServer()).get(`/api/v1/auctions/${auctionId}`).expect(200);

      expect(response.body.data).toHaveProperty('id', auctionId);
      expect(response.body.data).toHaveProperty('title', 'Detail Test Auction');
      expect(response.body.data).toHaveProperty('startingPrice', 200);
      expect(response.body.data).toHaveProperty('status', AuctionStatus.ACTIVE);
    });

    it('should return auction details for authenticated owner', async () => {
      const response = await request(app.getHttpServer()).get(`/api/v1/auctions/${auctionId}`).set('Authorization', `Bearer ${ownerAccessToken}`).expect(200);

      expect(response.body.data).toHaveProperty('id', auctionId);
    });

    it('should return 404 for non-existing auction id', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/auctions/999999999').expect(404);

      expect(response.body).toHaveProperty('statusCode', 404);
    });

    it('should return 400 when id is not a number', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/auctions/not-a-number').expect(400);

      expect(response.body).toHaveProperty('statusCode', 400);
    });

    it('should return 404 for canceled auction when not the owner', async () => {
      const canceled = await auctionRepository.save(
        auctionRepository.create({
          title: 'Canceled Auction',
          description: 'This auction was canceled',
          startingPrice: 100,
          currentPrice: 100,
          startTime: new Date(),
          endTime: new Date(Date.now() + 1 * 60 * 60 * 1000),
          ownerId,
          status: AuctionStatus.CANCELED,
          mainImageUrl: '/uploads/2026/03/test.jpg',
        }),
      );

      await request(app.getHttpServer()).get(`/api/v1/auctions/${canceled.id}`).expect(404);

      await request(app.getHttpServer()).get(`/api/v1/auctions/${canceled.id}`).set('Authorization', `Bearer ${otherAccessToken}`).expect(404);

      await auctionRepository.delete({ id: canceled.id });
    });

    it('should return 200 for canceled auction when requested by owner', async () => {
      const canceled = await auctionRepository.save(
        auctionRepository.create({
          title: 'Owner Canceled Auction',
          description: 'Owner can see this canceled auction',
          startingPrice: 100,
          currentPrice: 100,
          startTime: new Date(),
          endTime: new Date(Date.now() + 1 * 60 * 60 * 1000),
          ownerId,
          status: AuctionStatus.CANCELED,
          mainImageUrl: '/uploads/2026/03/test.jpg',
        }),
      );

      const response = await request(app.getHttpServer()).get(`/api/v1/auctions/${canceled.id}`).set('Authorization', `Bearer ${ownerAccessToken}`).expect(200);

      expect(response.body.data).toHaveProperty('status', AuctionStatus.CANCELED);

      await auctionRepository.delete({ id: canceled.id });
    });
  });

  // ════════════════════════════════════════════════════════════════
  // GET /api/v1/auctions/my/auctions
  // ════════════════════════════════════════════════════════════════
  describe('GET /api/v1/auctions/my/auctions', () => {
    it('should return 401 when not authenticated', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/auctions/my/auctions').expect(401);

      expect(response.body).toHaveProperty('statusCode', 401);
    });

    it('should return list of auctions for authenticated owner', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/auctions/my/auctions').set('Authorization', `Bearer ${ownerAccessToken}`).expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('items');
      expect(Array.isArray(response.body.data.items)).toBe(true);
    });

    it('should return 400 when limit is out of range', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/auctions/my/auctions').set('Authorization', `Bearer ${ownerAccessToken}`).query({ limit: 9999 }).expect(400);

      expect(response.body).toHaveProperty('statusCode', 400);
    });
  });

  // ════════════════════════════════════════════════════════════════
  // GET /api/v1/auctions/:id/bids
  // ════════════════════════════════════════════════════════════════
  describe('GET /api/v1/auctions/:id/bids', () => {
    let auctionId: number;

    beforeAll(async () => {
      const auction = await auctionRepository.save(
        auctionRepository.create({
          title: 'Bids Test Auction',
          description: 'Auction for bids endpoint testing',
          startingPrice: 300,
          currentPrice: 300,
          startTime: new Date(),
          endTime: new Date(Date.now() + 2 * 60 * 60 * 1000),
          ownerId,
          status: AuctionStatus.ACTIVE,
          mainImageUrl: '/uploads/2026/03/test.jpg',
        }),
      );
      auctionId = auction.id;
    });

    afterAll(async () => {
      await auctionImageRepository.delete({ auctionId });
      await auctionRepository.delete({ id: auctionId });
    });

    it('should return paginated bid list for an auction (empty)', async () => {
      const response = await request(app.getHttpServer()).get(`/api/v1/auctions/${auctionId}/bids`).expect(200);

      expect(response.body.data).toHaveProperty('items');
      expect(response.body.data.items).toHaveLength(0);
      expect(response.body.data).toHaveProperty('total', 0);
    });

    it('should return 404 for non-existing auction bids', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/auctions/999999999/bids').expect(404);

      expect(response.body).toHaveProperty('statusCode', 404);
    });

    it('should return 400 when auction id is not a number', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/auctions/not-a-number/bids').expect(400);

      expect(response.body).toHaveProperty('statusCode', 400);
    });
  });

  // ════════════════════════════════════════════════════════════════
  // PATCH /api/v1/auctions/:id
  // ════════════════════════════════════════════════════════════════
  describe('PATCH /api/v1/auctions/:id', () => {
    let auctionId: number;

    beforeEach(async () => {
      const auction = await auctionRepository.save(
        auctionRepository.create({
          title: 'Patch Test Auction',
          description: 'Auction for patch endpoint testing',
          startingPrice: 100,
          currentPrice: 100,
          startTime: new Date(),
          endTime: new Date(Date.now() + 3 * 60 * 60 * 1000),
          ownerId,
          status: AuctionStatus.ACTIVE,
          mainImageUrl: '/uploads/2026/03/test.jpg',
        }),
      );
      auctionId = auction.id;
    });

    afterEach(async () => {
      await auctionImageRepository.delete({ auctionId });
      await auctionRepository.delete({ id: auctionId });
    });

    it('should return 401 when not authenticated', async () => {
      const response = await request(app.getHttpServer()).patch(`/api/v1/auctions/${auctionId}`).send({ title: 'New Title' }).expect(401);

      expect(response.body).toHaveProperty('statusCode', 401);
    });

    it('should return 403 when user is not the owner', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/auctions/${auctionId}`)
        .set('Authorization', `Bearer ${otherAccessToken}`)
        .send({ title: 'Hacked Title' })
        .expect(403);

      expect(response.body).toHaveProperty('statusCode', 403);
    });

    it('should return 404 when auction does not exist', async () => {
      const response = await request(app.getHttpServer())
        .patch('/api/v1/auctions/999999999')
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({ title: 'New Title' })
        .expect(404);

      expect(response.body).toHaveProperty('statusCode', 404);
    });

    it('should return 400 when endTime is in the past', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/auctions/${auctionId}`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({ endTime: new Date(Date.now() - 1000).toISOString() })
        .expect(400);

      expect(response.body).toHaveProperty('statusCode', 400);
    });

    it('should return 400 when extra fields are sent (forbidNonWhitelisted)', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/auctions/${auctionId}`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({ title: 'Valid Title', unknownField: 'hack' })
        .expect(400);

      expect(response.body).toHaveProperty('statusCode', 400);
    });

    it('should update auction title and return updated data', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/auctions/${auctionId}`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({ title: 'Updated Title E2E' })
        .expect(200);

      expect(response.body.data).toHaveProperty('title', 'Updated Title E2E');
      expect(response.body.data).toHaveProperty('id', auctionId);
    });

    it('should update auction description and return updated data', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/auctions/${auctionId}`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({ description: 'Updated description for the E2E test auction' })
        .expect(200);

      expect(response.body.data).toHaveProperty('id', auctionId);
    });

    it('should extend endTime and return updated data', async () => {
      const newEndTime = new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString();

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/auctions/${auctionId}`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({ endTime: newEndTime })
        .expect(200);

      expect(response.body.data).toHaveProperty('id', auctionId);
    });

    it('should return 400 when trying to shorten endTime', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/auctions/${auctionId}`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({ endTime: new Date(Date.now() + 1 * 60 * 60 * 1000).toISOString() })
        .expect(400);

      expect(response.body).toHaveProperty('statusCode', 400);
    });

    it('should return 400 when auction is ENDED', async () => {
      const ended = await auctionRepository.save(
        auctionRepository.create({
          title: 'Ended Auction',
          description: 'This auction has ended',
          startingPrice: 100,
          currentPrice: 100,
          startTime: new Date(),
          endTime: new Date(Date.now() - 1 * 60 * 60 * 1000),
          ownerId,
          status: AuctionStatus.ENDED,
          mainImageUrl: '/uploads/2026/03/test.jpg',
        }),
      );

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/auctions/${ended.id}`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({ title: 'Try to update ended' })
        .expect(400);

      expect(response.body).toHaveProperty('statusCode', 400);

      await auctionRepository.delete({ id: ended.id });
    });
  });

  // ════════════════════════════════════════════════════════════════
  // DELETE /api/v1/auctions/:id
  // ════════════════════════════════════════════════════════════════
  describe('DELETE /api/v1/auctions/:id', () => {
    it('should return 401 when not authenticated', async () => {
      const response = await request(app.getHttpServer()).delete('/api/v1/auctions/1').expect(401);

      expect(response.body).toHaveProperty('statusCode', 401);
    });

    it('should return 404 when auction does not exist', async () => {
      const response = await request(app.getHttpServer()).delete('/api/v1/auctions/999999999').set('Authorization', `Bearer ${ownerAccessToken}`).expect(404);

      expect(response.body).toHaveProperty('statusCode', 404);
    });

    it('should return 400 when auction id is not a number', async () => {
      const response = await request(app.getHttpServer()).delete('/api/v1/auctions/not-a-number').set('Authorization', `Bearer ${ownerAccessToken}`).expect(400);

      expect(response.body).toHaveProperty('statusCode', 400);
    });

    it('should return 403 when user is not the owner', async () => {
      const auction = await auctionRepository.save(
        auctionRepository.create({
          title: 'Forbidden Cancel Auction',
          description: 'Other user should not cancel this',
          startingPrice: 100,
          currentPrice: 100,
          startTime: new Date(),
          endTime: new Date(Date.now() + 2 * 60 * 60 * 1000),
          ownerId,
          status: AuctionStatus.PENDING,
          mainImageUrl: '/uploads/2026/03/test.jpg',
        }),
      );

      const response = await request(app.getHttpServer()).delete(`/api/v1/auctions/${auction.id}`).set('Authorization', `Bearer ${otherAccessToken}`).expect(403);

      expect(response.body).toHaveProperty('statusCode', 403);

      await auctionRepository.delete({ id: auction.id });
    });

    it('should return 400 when trying to cancel an ENDED auction', async () => {
      const ended = await auctionRepository.save(
        auctionRepository.create({
          title: 'Ended Cannot Cancel',
          description: 'Ended auction cannot be canceled',
          startingPrice: 100,
          currentPrice: 100,
          startTime: new Date(),
          endTime: new Date(Date.now() - 1 * 60 * 60 * 1000),
          ownerId,
          status: AuctionStatus.ENDED,
          mainImageUrl: '/uploads/2026/03/test.jpg',
        }),
      );

      const response = await request(app.getHttpServer()).delete(`/api/v1/auctions/${ended.id}`).set('Authorization', `Bearer ${ownerAccessToken}`).expect(400);

      expect(response.body).toHaveProperty('statusCode', 400);

      await auctionRepository.delete({ id: ended.id });
    });

    it('should cancel a PENDING auction and return CANCELED status', async () => {
      const auction = await auctionRepository.save(
        auctionRepository.create({
          title: 'Pending To Cancel',
          description: 'This PENDING auction will be canceled',
          startingPrice: 100,
          currentPrice: 100,
          startTime: new Date(),
          endTime: new Date(Date.now() + 2 * 60 * 60 * 1000),
          ownerId,
          status: AuctionStatus.PENDING,
          mainImageUrl: '/uploads/2026/03/test.jpg',
        }),
      );

      const response = await request(app.getHttpServer()).delete(`/api/v1/auctions/${auction.id}`).set('Authorization', `Bearer ${ownerAccessToken}`).expect(200);

      expect(response.body.data).toHaveProperty('status', AuctionStatus.CANCELED);

      await auctionRepository.delete({ id: auction.id });
    });

    it('should cancel an ACTIVE auction with no bids and return CANCELED status', async () => {
      const auction = await auctionRepository.save(
        auctionRepository.create({
          title: 'Active No Bids Cancel',
          description: 'This ACTIVE auction with no bids will be canceled',
          startingPrice: 100,
          currentPrice: 100,
          startTime: new Date(),
          endTime: new Date(Date.now() + 2 * 60 * 60 * 1000),
          ownerId,
          status: AuctionStatus.ACTIVE,
          mainImageUrl: '/uploads/2026/03/test.jpg',
        }),
      );

      const response = await request(app.getHttpServer()).delete(`/api/v1/auctions/${auction.id}`).set('Authorization', `Bearer ${ownerAccessToken}`).expect(200);

      expect(response.body.data).toHaveProperty('status', AuctionStatus.CANCELED);

      await auctionRepository.delete({ id: auction.id });
    });
  });
});
