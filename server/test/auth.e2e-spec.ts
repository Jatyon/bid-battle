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
import { User } from '@modules/users/entities/user.entity';
import { UserTokenEnum } from '@modules/users/enums';
import { MailService, MailConsumerService } from '@shared/mail';
import { I18nService } from 'nestjs-i18n';
import { App } from 'supertest/types';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import request from 'supertest';

jest.mock('@css-inline/css-inline', () => ({
  inline: jest.fn((html: string): string => html),
}));

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  let userRepository: Repository<User>;
  let userTokenRepository: Repository<UserToken>;
  let configService: AppConfigService;
  let mailService: MailService;

  const TEST_EMAIL = `e2e-auth-${Date.now()}@test.com`;
  const TEST_PASSWORD = 'Password123!';
  const TEST_USER = {
    firstName: 'E2E',
    lastName: 'Test',
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
    passwordRepeat: TEST_PASSWORD,
  };

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
      })
      .compile();

    app = moduleFixture.createNestApplication();

    configService = app.get(AppConfigService);
    mailService = app.get(MailService);
    userRepository = moduleFixture.get(getRepositoryToken(User));
    userTokenRepository = moduleFixture.get(getRepositoryToken(UserToken));

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
  });

  afterAll(async () => {
    const user = await userRepository.findOneBy({ email: TEST_EMAIL });
    if (user) {
      await userTokenRepository.delete({ userId: user.id });
      await userRepository.delete({ id: user.id });
    }
    await app.close();
  });

  // ──────────────────────────────────────────────
  // POST /api/v1/auth/register
  // ──────────────────────────────────────────────
  describe('POST /api/v1/auth/register', () => {
    it('should register a new user and return success message', async () => {
      const response = await request(app.getHttpServer()).post('/api/v1/auth/register').send(TEST_USER).expect(200);

      expect(response.body.data).toHaveProperty('message');
      expect(mailService.sendEmailVerificationEmail).toHaveBeenCalledWith(TEST_EMAIL, expect.any(String), expect.any(String), expect.any(Number), expect.any(String));
    });

    it('should return 409 when email is already taken', async () => {
      const response = await request(app.getHttpServer()).post('/api/v1/auth/register').send(TEST_USER).expect(409);

      expect(response.body).toHaveProperty('statusCode', 409);
    });

    it('should return 400 when required fields are missing', async () => {
      const response = await request(app.getHttpServer()).post('/api/v1/auth/register').send({ email: 'incomplete@test.com' }).expect(400);

      expect(response.body).toHaveProperty('statusCode', 400);
    });

    it('should return 400 when email is invalid', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ ...TEST_USER, email: 'not-an-email' })
        .expect(400);

      expect(response.body).toHaveProperty('statusCode', 400);
    });

    it('should return 400 when passwords do not match', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ ...TEST_USER, email: 'other@test.com', passwordRepeat: 'DifferentPass1!' })
        .expect(400);

      expect(response.body).toHaveProperty('statusCode', 400);
    });

    it('should return 400 when extra fields are sent (forbidNonWhitelisted)', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ ...TEST_USER, email: 'other2@test.com', unknownField: 'hack' })
        .expect(400);

      expect(response.body).toHaveProperty('statusCode', 400);
    });
  });

  // ──────────────────────────────────────────────
  // POST /api/v1/auth/verify-email
  // ──────────────────────────────────────────────
  describe('POST /api/v1/auth/verify-email', () => {
    it('should verify email with valid token and return success message', async () => {
      const user = await userRepository.findOneBy({ email: TEST_EMAIL });
      const tokenEntity = await userTokenRepository.findOne({
        where: { userId: user!.id, type: UserTokenEnum.EMAIL_VERIFICATION, isUsed: false },
      });

      const response = await request(app.getHttpServer()).post('/api/v1/auth/verify-email').send({ token: tokenEntity!.token }).expect(200);

      expect(response.body.data).toHaveProperty('message');
    });

    it('should return 400 when token is invalid', async () => {
      const response = await request(app.getHttpServer()).post('/api/v1/auth/verify-email').send({ token: 'invalid-token-xyz' }).expect(400);

      expect(response.body).toHaveProperty('statusCode', 400);
    });

    it('should return 400 when email is already verified', async () => {
      const user = await userRepository.findOneBy({ email: TEST_EMAIL });
      const usedToken = await userTokenRepository.findOne({
        where: { userId: user!.id, type: UserTokenEnum.EMAIL_VERIFICATION },
        order: { createdAt: 'DESC' },
      });

      const response = await request(app.getHttpServer()).post('/api/v1/auth/verify-email').send({ token: usedToken!.token }).expect(400);

      expect(response.body).toHaveProperty('statusCode', 400);
    });

    it('should return 400 when token field is missing', async () => {
      const response = await request(app.getHttpServer()).post('/api/v1/auth/verify-email').send({}).expect(400);

      expect(response.body).toHaveProperty('statusCode', 400);
    });
  });

  // ──────────────────────────────────────────────
  // POST /api/v1/auth/login
  // ──────────────────────────────────────────────
  describe('POST /api/v1/auth/login', () => {
    it('should login successfully and return accessToken + refreshToken', async () => {
      const response = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: TEST_EMAIL, password: TEST_PASSWORD }).expect(200);

      expect(response.body.data).toHaveProperty('accessToken');
      expect(response.body.data).toHaveProperty('refreshToken');
      expect(typeof response.body.data.accessToken).toBe('string');
      expect(typeof response.body.data.refreshToken).toBe('string');
    });

    it('should return 401 when password is wrong', async () => {
      const response = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: TEST_EMAIL, password: 'WrongPass999!' }).expect(401);

      expect(response.body).toHaveProperty('statusCode', 401);
    });

    it('should return 401 when email does not exist', async () => {
      const response = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: 'nonexistent@test.com', password: TEST_PASSWORD }).expect(401);

      expect(response.body).toHaveProperty('statusCode', 401);
    });

    it('should return 401 when email is not verified', async () => {
      const unverifiedEmail = `unverified-${Date.now()}@test.com`;
      const salt = await bcrypt.genSalt(10);
      const hash = await bcrypt.hash(TEST_PASSWORD, salt);

      const unverified = userRepository.create({
        email: unverifiedEmail,
        firstName: 'Un',
        lastName: 'Verified',
        password: hash,
        isEmailVerified: false,
      });
      const saved = await userRepository.save(unverified);

      const response = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: unverifiedEmail, password: TEST_PASSWORD }).expect(401);

      expect(response.body).toHaveProperty('statusCode', 401);

      await userRepository.delete({ id: saved.id });
    });

    it('should return 400 when body is empty', async () => {
      const response = await request(app.getHttpServer()).post('/api/v1/auth/login').send({}).expect(400);

      expect(response.body).toHaveProperty('statusCode', 400);
    });
  });

  // ──────────────────────────────────────────────
  // POST /api/v1/auth/refresh
  // ──────────────────────────────────────────────
  describe('POST /api/v1/auth/refresh', () => {
    let validRefreshToken: string;

    beforeAll(async () => {
      const loginResponse = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: TEST_EMAIL, password: TEST_PASSWORD });

      validRefreshToken = loginResponse.body.data.refreshToken;
    });

    it('should return new tokens when refresh token is valid', async () => {
      const response = await request(app.getHttpServer()).post('/api/v1/auth/refresh').send({ refreshToken: validRefreshToken }).expect(200);

      expect(response.body.data).toHaveProperty('accessToken');
      expect(response.body.data).toHaveProperty('refreshToken');
    });

    it('should return 401 when refresh token is already used (rotation)', async () => {
      const response = await request(app.getHttpServer()).post('/api/v1/auth/refresh').send({ refreshToken: validRefreshToken }).expect(401);

      expect(response.body).toHaveProperty('statusCode', 401);
    });

    it('should return 401 when refresh token is completely invalid', async () => {
      const response = await request(app.getHttpServer()).post('/api/v1/auth/refresh').send({ refreshToken: 'totally.invalid.token' }).expect(401);

      expect(response.body).toHaveProperty('statusCode', 401);
    });

    it('should return 400 when refreshToken field is missing', async () => {
      const response = await request(app.getHttpServer()).post('/api/v1/auth/refresh').send({}).expect(400);

      expect(response.body).toHaveProperty('statusCode', 400);
    });
  });

  // ──────────────────────────────────────────────
  // GET /api/v1/auth/me
  // ──────────────────────────────────────────────
  describe('GET /api/v1/auth/me', () => {
    let accessToken: string;

    beforeAll(async () => {
      const loginResponse = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: TEST_EMAIL, password: TEST_PASSWORD });

      accessToken = loginResponse.body.data.accessToken;
    });

    it('should return current user profile', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/auth/me').set('Authorization', `Bearer ${accessToken}`).expect(200);

      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data).toHaveProperty('email', TEST_EMAIL);
      expect(response.body.data).toHaveProperty('firstName', TEST_USER.firstName);
      expect(response.body.data).toHaveProperty('lastName', TEST_USER.lastName);
      expect(response.body.data).not.toHaveProperty('password');
    });

    it('should return 401 when no token is provided', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/auth/me').expect(401);

      expect(response.body).toHaveProperty('statusCode', 401);
    });

    it('should return 401 when token is malformed', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/auth/me').set('Authorization', 'Bearer malformed.token.here').expect(401);

      expect(response.body).toHaveProperty('statusCode', 401);
    });
  });

  // ──────────────────────────────────────────────
  // POST /api/v1/auth/change-password
  // ──────────────────────────────────────────────
  describe('POST /api/v1/auth/change-password', () => {
    let accessToken: string;
    const NEW_PASSWORD = 'NewPassword456!';

    beforeAll(async () => {
      const loginResponse = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: TEST_EMAIL, password: TEST_PASSWORD });

      accessToken = loginResponse.body.data.accessToken;
    });

    it('should return 401 when no token is provided', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/change-password')
        .send({ currentPassword: TEST_PASSWORD, password: NEW_PASSWORD, passwordRepeat: NEW_PASSWORD })
        .expect(401);

      expect(response.body).toHaveProperty('statusCode', 401);
    });

    it('should return 400 when current password is wrong', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ currentPassword: 'WrongCurrentPass1!', password: NEW_PASSWORD, passwordRepeat: NEW_PASSWORD })
        .expect(400);

      expect(response.body).toHaveProperty('statusCode', 400);
    });

    it('should return 400 when new passwords do not match', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ currentPassword: TEST_PASSWORD, password: 'Mismatch1!', passwordRepeat: 'Mismatch2!' })
        .expect(400);

      expect(response.body).toHaveProperty('statusCode', 400);
    });

    it('should change password successfully', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ currentPassword: TEST_PASSWORD, password: NEW_PASSWORD, passwordRepeat: NEW_PASSWORD })
        .expect(200);

      expect(response.body.data).toHaveProperty('message');
    });

    it('should be possible to login with new password after change', async () => {
      const response = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: TEST_EMAIL, password: NEW_PASSWORD }).expect(200);

      expect(response.body.data).toHaveProperty('accessToken');

      const newAccessToken: string = response.body.data.accessToken;
      await request(app.getHttpServer())
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${newAccessToken}`)
        .send({ currentPassword: NEW_PASSWORD, password: TEST_PASSWORD, passwordRepeat: TEST_PASSWORD });
    });
  });

  // ──────────────────────────────────────────────
  // POST /api/v1/auth/forgot-password
  // ──────────────────────────────────────────────
  describe('POST /api/v1/auth/forgot-password', () => {
    it('should return 200 and success message for existing email', async () => {
      const response = await request(app.getHttpServer()).post('/api/v1/auth/forgot-password').send({ email: TEST_EMAIL }).expect(200);

      expect(response.body.data).toHaveProperty('message');
      expect(mailService.sendForgotPasswordEmail).toHaveBeenCalled();
    });

    it('should return 200 silently for non-existing email (security: no user enumeration)', async () => {
      const response = await request(app.getHttpServer()).post('/api/v1/auth/forgot-password').send({ email: 'ghost@test.com' }).expect(200);

      expect(response.body.data).toHaveProperty('message');
    });

    it('should return 400 when email is invalid', async () => {
      const response = await request(app.getHttpServer()).post('/api/v1/auth/forgot-password').send({ email: 'not-an-email' }).expect(400);

      expect(response.body).toHaveProperty('statusCode', 400);
    });

    it('should return 400 when email field is missing', async () => {
      const response = await request(app.getHttpServer()).post('/api/v1/auth/forgot-password').send({}).expect(400);

      expect(response.body).toHaveProperty('statusCode', 400);
    });
  });

  // ──────────────────────────────────────────────
  // POST /api/v1/auth/reset-password
  // ──────────────────────────────────────────────
  describe('POST /api/v1/auth/reset-password', () => {
    let resetToken: string;

    beforeAll(async () => {
      await request(app.getHttpServer()).post('/api/v1/auth/forgot-password').send({ email: TEST_EMAIL });

      const user = await userRepository.findOneBy({ email: TEST_EMAIL });
      const tokenEntity = await userTokenRepository.findOne({
        where: { userId: user!.id, type: UserTokenEnum.PASSWORD_RESET, isUsed: false },
        order: { createdAt: 'DESC' },
      });

      resetToken = tokenEntity!.token;
    });

    it('should reset password successfully with valid token', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/reset-password')
        .send({ token: resetToken, password: TEST_PASSWORD, passwordRepeat: TEST_PASSWORD })
        .expect(200);

      expect(response.body.data).toHaveProperty('message');
      expect(mailService.sendPasswordChangedEmail).toHaveBeenCalled();
    });

    it('should return 400 when token is already used', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/reset-password')
        .send({ token: resetToken, password: TEST_PASSWORD, passwordRepeat: TEST_PASSWORD })
        .expect(400);

      expect(response.body).toHaveProperty('statusCode', 400);
    });

    it('should return 400 when token is invalid', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/reset-password')
        .send({ token: 'invalid-reset-token', password: TEST_PASSWORD, passwordRepeat: TEST_PASSWORD })
        .expect(400);

      expect(response.body).toHaveProperty('statusCode', 400);
    });

    it('should return 400 when passwords do not match', async () => {
      const user = await userRepository.findOneBy({ email: TEST_EMAIL });
      const freshToken = await userTokenRepository.save(
        userTokenRepository.create({
          token: 'fresh-token-for-mismatch-test',
          type: UserTokenEnum.PASSWORD_RESET,
          userId: user!.id,
          user: user!,
          expiresAt: new Date(Date.now() + 15 * 60 * 1000),
          isUsed: false,
        }),
      );

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/reset-password')
        .send({ token: freshToken.token, password: 'NewPass1!', passwordRepeat: 'Different1!' })
        .expect(400);

      expect(response.body).toHaveProperty('statusCode', 400);

      await userTokenRepository.delete({ id: freshToken.id });
    });

    it('should return 400 when token field is missing', async () => {
      const response = await request(app.getHttpServer()).post('/api/v1/auth/reset-password').send({ password: TEST_PASSWORD, passwordRepeat: TEST_PASSWORD }).expect(400);

      expect(response.body).toHaveProperty('statusCode', 400);
    });
  });

  // ──────────────────────────────────────────────
  // POST /api/v1/auth/resend-verification
  // ──────────────────────────────────────────────
  describe('POST /api/v1/auth/resend-verification', () => {
    it('should return 200 and success message for existing unverified email', async () => {
      const unverifiedEmail = `resend-${Date.now()}@test.com`;
      const salt = await bcrypt.genSalt(10);
      const hash = await bcrypt.hash(TEST_PASSWORD, salt);
      const unverified = userRepository.create({
        email: unverifiedEmail,
        firstName: 'Resend',
        lastName: 'Test',
        password: hash,
        isEmailVerified: false,
      });
      const saved = await userRepository.save(unverified);

      const response = await request(app.getHttpServer()).post('/api/v1/auth/resend-verification').send({ email: unverifiedEmail }).expect(200);

      expect(response.body.data).toHaveProperty('message');
      expect(mailService.sendEmailVerificationEmail).toHaveBeenCalled();

      await userTokenRepository.delete({ userId: saved.id });
      await userRepository.delete({ id: saved.id });
    });

    it('should return 200 silently for non-existing email (security: no user enumeration)', async () => {
      const response = await request(app.getHttpServer()).post('/api/v1/auth/resend-verification').send({ email: 'ghost-resend@test.com' }).expect(200);

      expect(response.body.data).toHaveProperty('message');
    });

    it('should return 200 silently for already-verified email', async () => {
      const response = await request(app.getHttpServer()).post('/api/v1/auth/resend-verification').send({ email: TEST_EMAIL }).expect(200);

      expect(response.body.data).toHaveProperty('message');
    });

    it('should return 400 when email field is missing', async () => {
      const response = await request(app.getHttpServer()).post('/api/v1/auth/resend-verification').send({}).expect(400);

      expect(response.body).toHaveProperty('statusCode', 400);
    });
  });
});
