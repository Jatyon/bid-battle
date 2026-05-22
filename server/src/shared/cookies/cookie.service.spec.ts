import { Test, TestingModule } from '@nestjs/testing';
import { AppConfigService } from '@config/config.service';
import { createMock, DeepMocked } from '@golevelup/ts-jest';
import { CookieService } from './cookie.service';
import * as express from 'express';
import ms from 'ms';

describe('CookieService', () => {
  let service: CookieService;
  let configService: DeepMocked<AppConfigService>;
  let mockRes: DeepMocked<express.Response>;

  const mockCookieName = 'test_refresh_token';
  const mockTokenLife = '7d';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CookieService,
        {
          provide: AppConfigService,
          useValue: createMock<AppConfigService>({
            app: { mode: 'development' },
            jwt: { refreshTokenLife: mockTokenLife },
            cookies: { refreshTokenName: mockCookieName },
          }),
        },
      ],
    }).compile();

    service = module.get<CookieService>(CookieService);
    configService = module.get(AppConfigService);
    mockRes = createMock<express.Response>();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('setRefreshToken', () => {
    it('should set refresh token cookie with secure: false in development mode', () => {
      const token = 'some-refresh-token';
      const expectedMaxAge = ms(mockTokenLife);

      service.setRefreshToken(mockRes, token);

      expect(mockRes.cookie).toHaveBeenCalledWith(mockCookieName, token, {
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        maxAge: expectedMaxAge,
        path: '/',
      });
    });

    it('should set refresh token cookie with secure: true in production mode', () => {
      configService.app.mode = 'production';

      const token = 'secure-refresh-token';
      const expectedMaxAge = ms(mockTokenLife);

      service.setRefreshToken(mockRes, token);

      expect(mockRes.cookie).toHaveBeenCalledWith(mockCookieName, token, {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        maxAge: expectedMaxAge,
        path: '/',
      });
    });
  });

  describe('clearRefreshToken', () => {
    it('should call res.clearCookie with the correct name and options', () => {
      service.clearRefreshToken(mockRes);

      expect(mockRes.clearCookie).toHaveBeenCalledWith(mockCookieName, {
        httpOnly: true,
        path: '/',
      });
    });
  });

  describe('getCookie', () => {
    it('should return the cookie value if it exists', () => {
      const mockReq = { cookies: { my_cookie: 'cookie-value' } };

      const result = service.getCookie(mockReq, 'my_cookie');

      expect(result).toBe('cookie-value');
    });

    it('should return undefined if the cookie does not exist', () => {
      const mockReq = { cookies: { other_cookie: 'value' } };

      const result = service.getCookie(mockReq, 'missing_cookie');

      expect(result).toBeUndefined();
    });

    it('should return undefined if req.cookies is undefined', () => {
      const mockReq = {};

      const result = service.getCookie(mockReq, 'any_cookie');

      expect(result).toBeUndefined();
    });
  });

  describe('getRefreshToken', () => {
    it('should return the refresh token using the configured cookie name', () => {
      const mockReq = { cookies: { [mockCookieName]: 'actual-refresh-token' } };

      const result = service.getRefreshToken(mockReq);

      expect(result).toBe('actual-refresh-token');
    });

    it('should return undefined if the refresh token cookie is not present', () => {
      const mockReq = { cookies: { some_other_cookie: 'value' } };

      const result = service.getRefreshToken(mockReq);

      expect(result).toBeUndefined();
    });
  });
});
