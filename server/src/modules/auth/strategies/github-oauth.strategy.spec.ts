import { Test, TestingModule } from '@nestjs/testing';
import { AppConfigService } from '@config/config.service';
import { createMock } from '@golevelup/ts-jest';
import { GithubOAuthStrategy } from './github-oauth.strategy';

describe('GithubOAuthStrategy', () => {
  let strategy: GithubOAuthStrategy;

  beforeEach(async () => {
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

    it('should handle missing optional profile fields gracefully', () => {
      const profile = {
        id: 67890,
        emails: [],
        displayName: '',
        username: '',
        photos: [],
      };

      const done = jest.fn();

      strategy.validate('access_token', 'refresh_token', profile, done);

      expect(done).toHaveBeenCalledWith(null, {
        providerId: '67890',
        email: '',
        emailVerified: false,
        firstName: '',
        lastName: '',
        avatar: null,
      });
    });
  });
});
