import { UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppConfigService } from '@config/config.service';
import { createMock } from '@golevelup/ts-jest';
import { GoogleOAuthStrategy } from './google-oauth.strategy';
import { Profile } from 'passport-google-oauth20';

describe('GoogleOAuthStrategy', () => {
  let strategy: GoogleOAuthStrategy;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GoogleOAuthStrategy,
        {
          provide: AppConfigService,
          useValue: createMock<AppConfigService>({
            google: {
              clientId: 'test-client-id',
              clientSecret: 'test-client-secret',
              callbackUrl: 'http://localhost:3000/auth/google/callback',
            },
          }),
        },
      ],
    }).compile();

    strategy = module.get<GoogleOAuthStrategy>(GoogleOAuthStrategy);
  });

  describe('validate', () => {
    it('should map Google profile to IOAuthProfile and call done', () => {
      const profile = {
        id: 'google-id-123',
        emails: [{ value: 'google@example.com', verified: true }],
        name: { givenName: 'Jane', familyName: 'Smith' },
        photos: [{ value: 'https://example.com/avatar.jpg' }],
      } as unknown as Profile;

      const done = jest.fn();

      strategy.validate('access_token', 'refresh_token', profile, done);

      expect(done).toHaveBeenCalledWith(null, {
        providerId: 'google-id-123',
        email: 'google@example.com',
        emailVerified: true,
        firstName: 'Jane',
        lastName: 'Smith',
        avatar: 'https://example.com/avatar.jpg',
      });
    });

    it('should handle missing optional profile fields (name, photos) gracefully', () => {
      const profile = {
        id: 'google-id-456',
        emails: [{ value: 'valid@example.com', verified: true }],
        name: {},
        photos: [],
      } as unknown as Profile;

      const done = jest.fn();

      strategy.validate('access_token', 'refresh_token', profile, done);

      expect(done).toHaveBeenCalledWith(null, {
        providerId: 'google-id-456',
        email: 'valid@example.com',
        emailVerified: true,
        firstName: '',
        lastName: '',
        avatar: null,
      });
    });

    it('should throw UnauthorizedException if email is missing or not verified', () => {
      const profile = {
        id: 'google-id-789',
        emails: [],
        name: { givenName: 'Jane', familyName: 'Smith' },
      } as unknown as Profile;

      const done = jest.fn();

      expect(() => {
        strategy.validate('access_token', 'refresh_token', profile, done);
      }).toThrow(UnauthorizedException);

      expect(done).not.toHaveBeenCalled();
    });
  });
});
