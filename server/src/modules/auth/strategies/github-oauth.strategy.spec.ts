import { UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppConfigService } from '@config/config.service';
import { createMockI18nService } from '@test/mocks/i18n.mock';
import { createMock, DeepMocked } from '@golevelup/ts-jest';
import { GithubOAuthStrategy, GithubProfile } from './github-oauth.strategy';
import { I18nService } from 'nestjs-i18n';

describe('GithubOAuthStrategy', () => {
  let strategy: GithubOAuthStrategy;
  let i18nService: DeepMocked<I18nService>;

  beforeEach(async () => {
    i18nService = createMockI18nService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GithubOAuthStrategy,
        {
          provide: AppConfigService,
          useValue: createMock<AppConfigService>({
            github: {
              clientId: 'test-client-id',
              clientSecret: 'test-client-secret',
              callbackUrl: 'http://localhost:3000/auth/github/callback',
            },
          }),
        },
        {
          provide: I18nService,
          useValue: i18nService,
        },
      ],
    }).compile();

    strategy = module.get<GithubOAuthStrategy>(GithubOAuthStrategy);
  });

  describe('validate', () => {
    it('should map GitHub profile to IOAuthProfile and call done', () => {
      const profile = {
        id: 12345,
        emails: [
          { value: 'primary@example.com', primary: true, verified: true },
          { value: 'secondary@example.com', verified: true },
        ],
        displayName: 'John Doe',
        username: 'johnd',
        photos: [{ value: 'https://example.com/avatar.png' }],
      };

      const done = jest.fn();

      strategy.validate('access_token', 'refresh_token', profile, done);

      expect(done).toHaveBeenCalledWith(null, {
        providerId: '12345',
        email: 'primary@example.com',
        emailVerified: true,
        firstName: 'John',
        lastName: 'Doe',
        avatar: 'https://example.com/avatar.png',
      });
    });

    it('should handle missing optional profile fields (name, photos) gracefully', () => {
      const profile = {
        id: 67890,
        emails: [{ value: 'valid@example.com', primary: true, verified: true }],
        displayName: '',
        username: '',
        photos: [],
      };

      const done = jest.fn();

      strategy.validate('access_token', 'refresh_token', profile, done);

      expect(done).toHaveBeenCalledWith(null, {
        providerId: '67890',
        email: 'valid@example.com',
        emailVerified: true,
        firstName: '',
        lastName: '',
        avatar: null,
      });
    });

    it('should throw UnauthorizedException if email is missing or not verified', () => {
      const profile = {
        id: 99999,
        emails: [],
        displayName: 'John Doe',
      };

      const done = jest.fn();

      expect(() => {
        strategy.validate('access_token', 'refresh_token', profile as unknown as GithubProfile, done);
      }).toThrow(UnauthorizedException);

      expect(done).not.toHaveBeenCalled();
    });
  });
});
