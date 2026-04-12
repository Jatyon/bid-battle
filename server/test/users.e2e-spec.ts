/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import { INestApplication, Logger, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AppModule } from '@app/app.module';
import { AppConfigService } from '@config/config.service';
import { LoggingInterceptor, TimeoutInterceptor, TransformInterceptor } from '@core/interceptors';
import { HttpExceptionFilter } from '@core/filters/http-exception.filter';
import { Language } from '@core/enums/language.enum';
import { UserPreferences } from '@modules/users/entities/user-preferences.entity';
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

describe('Users (e2e)', () => {
  let app: INestApplication<App>;
  let userRepository: Repository<User>;
  let userTokenRepository: Repository<UserToken>;
  let userPreferencesRepository: Repository<UserPreferences>;
  let configService: AppConfigService;

  const TEST_EMAIL = `e2e-users-${Date.now()}@test.com`;
  const TEST_PASSWORD = 'Password123!';
  const TEST_USER = {
    firstName: 'E2E',
    lastName: 'Users',
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
    passwordRepeat: TEST_PASSWORD,
  };

  let accessToken: string;
  let userId: number;

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
    userPreferencesRepository = moduleFixture.get(getRepositoryToken(UserPreferences));

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

    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(TEST_PASSWORD, salt);

    const user = userRepository.create({
      email: TEST_EMAIL,
      firstName: TEST_USER.firstName,
      lastName: TEST_USER.lastName,
      password: hash,
      isEmailVerified: true,
    });
    const savedUser = await userRepository.save(user);
    userId = savedUser.id;

    const loginResponse = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: TEST_EMAIL, password: TEST_PASSWORD });

    accessToken = loginResponse.body.data.accessToken;
  });

  afterAll(async () => {
    const user = await userRepository.findOneBy({ email: TEST_EMAIL });
    if (user) {
      await userPreferencesRepository.delete({ userId: user.id });
      await userTokenRepository.delete({ userId: user.id });
      await userRepository.delete({ id: user.id });
    }
    await app.close();
  });

  // ──────────────────────────────────────────────
  // GET /api/v1/users
  // ──────────────────────────────────────────────
  describe('GET /api/v1/users', () => {
    it('should return list of public users without query', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/users').expect(200);

      expect(response.body).toHaveProperty('data');
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should return users matching the search query', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/users').query({ q: TEST_USER.firstName }).expect(200);

      expect(response.body).toHaveProperty('data');
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);

      const usersData = response.body.data as Array<{ firstName: string }>;

      const found = usersData.find((u) => u.firstName === TEST_USER.firstName);
      expect(found).toBeDefined();
    });

    it('should return empty array when no users match the query', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/users').query({ q: 'ZZZNonExistentNameZZZ' }).expect(200);

      expect(response.body).toHaveProperty('data');
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBe(0);
    });

    it('should return 400 when query is too short (less than 2 chars)', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/users').query({ q: 'a' }).expect(400);

      expect(response.body).toHaveProperty('statusCode', 400);
    });

    it('should return 400 when limit is out of range', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/users').query({ limit: 999 }).expect(400);

      expect(response.body).toHaveProperty('statusCode', 400);
    });

    it('should return only public fields (no email, no password)', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/users').query({ q: TEST_USER.firstName }).expect(200);

      if (response.body.data.length > 0) {
        const user = response.body.data[0];
        expect(user).not.toHaveProperty('email');
        expect(user).not.toHaveProperty('password');
        expect(user).toHaveProperty('id');
        expect(user).toHaveProperty('firstName');
        expect(user).toHaveProperty('lastNameInitial');
        expect(user).toHaveProperty('joinedAt');
      }
    });
  });

  // ──────────────────────────────────────────────
  // GET /api/v1/users/:id
  // ──────────────────────────────────────────────
  describe('GET /api/v1/users/:id', () => {
    it('should return public profile for existing user', async () => {
      const response = await request(app.getHttpServer()).get(`/api/v1/users/${userId}`).expect(200);

      expect(response.body.data).toHaveProperty('id', userId);
      expect(response.body.data).toHaveProperty('firstName', TEST_USER.firstName);
      expect(response.body.data).toHaveProperty('lastNameInitial');
      expect(response.body.data).toHaveProperty('joinedAt');
      expect(response.body.data).not.toHaveProperty('email');
      expect(response.body.data).not.toHaveProperty('password');
    });

    it('should return lastNameInitial as first letter + dot', async () => {
      const response = await request(app.getHttpServer()).get(`/api/v1/users/${userId}`).expect(200);

      const expectedInitial = `${TEST_USER.lastName.charAt(0)}.`;
      expect(response.body.data.lastNameInitial).toBe(expectedInitial);
    });

    it('should return 404 for non-existing user id', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/users/999999999').expect(404);

      expect(response.body).toHaveProperty('statusCode', 404);
    });

    it('should return 400 when id is not a number', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/users/not-a-number').expect(400);

      expect(response.body).toHaveProperty('statusCode', 400);
    });
  });

  // ──────────────────────────────────────────────
  // GET /api/v1/user/preferences
  // ──────────────────────────────────────────────
  describe('GET /api/v1/user/preferences', () => {
    it('should return user preferences when authenticated', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/user/preferences').set('Authorization', `Bearer ${accessToken}`).expect(200);

      expect(response.body.data).toHaveProperty('lang');
      expect(response.body.data).toHaveProperty('notifyOnOutbid');
      expect(response.body.data).toHaveProperty('notifyOnAuctionEnd');
      expect(Object.values(Language)).toContain(response.body.data.lang);
    });

    it('should return 401 when no token is provided', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/user/preferences').expect(401);

      expect(response.body).toHaveProperty('statusCode', 401);
    });

    it('should return 401 when token is malformed', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/user/preferences').set('Authorization', 'Bearer malformed.token.here').expect(401);

      expect(response.body).toHaveProperty('statusCode', 401);
    });
  });

  // ──────────────────────────────────────────────
  // PUT /api/v1/user/preferences
  // ──────────────────────────────────────────────
  describe('PUT /api/v1/user/preferences', () => {
    it('should update user preferences and return updated data', async () => {
      const payload = { lang: Language.PL, notifyOnOutbid: false, notifyOnAuctionEnd: true };

      const response = await request(app.getHttpServer()).put('/api/v1/user/preferences').set('Authorization', `Bearer ${accessToken}`).send(payload).expect(200);

      expect(response.body.data).toHaveProperty('lang', Language.PL);
      expect(response.body.data).toHaveProperty('notifyOnOutbid', false);
      expect(response.body.data).toHaveProperty('notifyOnAuctionEnd', true);
    });

    it('should persist updated preferences on subsequent GET', async () => {
      await request(app.getHttpServer())
        .put('/api/v1/user/preferences')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ lang: Language.EN, notifyOnOutbid: true, notifyOnAuctionEnd: false });

      const response = await request(app.getHttpServer()).get('/api/v1/user/preferences').set('Authorization', `Bearer ${accessToken}`).expect(200);

      expect(response.body.data).toHaveProperty('lang', Language.EN);
      expect(response.body.data).toHaveProperty('notifyOnOutbid', true);
      expect(response.body.data).toHaveProperty('notifyOnAuctionEnd', false);
    });

    it('should return 400 when lang is invalid', async () => {
      const response = await request(app.getHttpServer())
        .put('/api/v1/user/preferences')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ lang: 'xx', notifyOnOutbid: true, notifyOnAuctionEnd: true })
        .expect(400);

      expect(response.body).toHaveProperty('statusCode', 400);
    });

    it('should return 400 when notifyOnOutbid is missing', async () => {
      const response = await request(app.getHttpServer())
        .put('/api/v1/user/preferences')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ lang: Language.EN, notifyOnAuctionEnd: true })
        .expect(400);

      expect(response.body).toHaveProperty('statusCode', 400);
    });

    it('should return 400 when body is empty', async () => {
      const response = await request(app.getHttpServer()).put('/api/v1/user/preferences').set('Authorization', `Bearer ${accessToken}`).send({}).expect(400);

      expect(response.body).toHaveProperty('statusCode', 400);
    });

    it('should return 401 when no token is provided', async () => {
      const response = await request(app.getHttpServer()).put('/api/v1/user/preferences').send({ lang: Language.EN, notifyOnOutbid: true, notifyOnAuctionEnd: true }).expect(401);

      expect(response.body).toHaveProperty('statusCode', 401);
    });
  });

  // ──────────────────────────────────────────────
  // PATCH /api/v1/user/profile
  // ──────────────────────────────────────────────
  describe('PATCH /api/v1/user/profile', () => {
    it('should update firstName and return updated user', async () => {
      const response = await request(app.getHttpServer())
        .patch('/api/v1/user/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ firstName: 'UpdatedName' })
        .expect(200);

      expect(response.body.data).toHaveProperty('firstName', 'UpdatedName');
      expect(response.body.data).not.toHaveProperty('password');
    });

    it('should update lastName and return updated user', async () => {
      const response = await request(app.getHttpServer()).patch('/api/v1/user/profile').set('Authorization', `Bearer ${accessToken}`).send({ lastName: 'UpdatedLast' }).expect(200);

      expect(response.body.data).toHaveProperty('lastName', 'UpdatedLast');
    });

    it('should update both firstName and lastName', async () => {
      const response = await request(app.getHttpServer())
        .patch('/api/v1/user/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ firstName: 'E2E', lastName: 'Users' })
        .expect(200);

      expect(response.body.data).toHaveProperty('firstName', 'E2E');
      expect(response.body.data).toHaveProperty('lastName', 'Users');
    });

    it('should return 200 when body is empty (all fields optional)', async () => {
      const response = await request(app.getHttpServer()).patch('/api/v1/user/profile').set('Authorization', `Bearer ${accessToken}`).send({}).expect(200);

      expect(response.body.data).toHaveProperty('id', userId);
    });

    it('should return 400 when extra fields are sent (forbidNonWhitelisted)', async () => {
      const response = await request(app.getHttpServer())
        .patch('/api/v1/user/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ firstName: 'Valid', unknownField: 'hack' })
        .expect(400);

      expect(response.body).toHaveProperty('statusCode', 400);
    });

    it('should return 400 when firstName exceeds max length', async () => {
      const response = await request(app.getHttpServer())
        .patch('/api/v1/user/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ firstName: 'A'.repeat(256) })
        .expect(400);

      expect(response.body).toHaveProperty('statusCode', 400);
    });

    it('should return 401 when no token is provided', async () => {
      const response = await request(app.getHttpServer()).patch('/api/v1/user/profile').send({ firstName: 'Test' }).expect(401);

      expect(response.body).toHaveProperty('statusCode', 401);
    });
  });

  // ──────────────────────────────────────────────
  // DELETE /api/v1/user (delete account)
  // ──────────────────────────────────────────────
  describe('DELETE /api/v1/user', () => {
    it('should return 401 when no token is provided', async () => {
      const response = await request(app.getHttpServer()).delete('/api/v1/user').expect(401);

      expect(response.body).toHaveProperty('statusCode', 401);
    });

    it('should soft-delete the account and return success message', async () => {
      const salt = await bcrypt.genSalt(10);
      const hash = await bcrypt.hash(TEST_PASSWORD, salt);

      const deleteEmail = `e2e-delete-${Date.now()}@test.com`;
      const userToDelete = userRepository.create({
        email: deleteEmail,
        firstName: 'Delete',
        lastName: 'Me',
        password: hash,
        isEmailVerified: true,
      });
      const saved = await userRepository.save(userToDelete);

      const loginResponse = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: deleteEmail, password: TEST_PASSWORD });

      const tokenToDelete = loginResponse.body.data.accessToken;

      const response = await request(app.getHttpServer()).delete('/api/v1/user').set('Authorization', `Bearer ${tokenToDelete}`).expect(200);

      expect(response.body.data).toHaveProperty('message');

      const deletedUser = await userRepository.findOne({ where: { id: saved.id }, withDeleted: true });
      expect(deletedUser?.deletedAt).not.toBeNull();

      await userTokenRepository.delete({ userId: saved.id });
      await userRepository.delete({ id: saved.id });
    });
  });

  // ──────────────────────────────────────────────
  // DELETE /api/v1/user/avatar
  // ──────────────────────────────────────────────
  describe('DELETE /api/v1/user/avatar', () => {
    it('should return 401 when no token is provided', async () => {
      const response = await request(app.getHttpServer()).delete('/api/v1/user/avatar').expect(401);

      expect(response.body).toHaveProperty('statusCode', 401);
    });

    it('should return success message when user has no avatar (idempotent)', async () => {
      const response = await request(app.getHttpServer()).delete('/api/v1/user/avatar').set('Authorization', `Bearer ${accessToken}`).expect(200);

      expect(response.body.data).toHaveProperty('message');
    });
  });
});
