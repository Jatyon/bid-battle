import { TestBed } from '@angular/core/testing';
import { environment } from '@env/environment';
import { OAuthService } from './oauth.service';
import { OAuthProvider } from '../types';

describe('OAuthService', () => {
  let service: OAuthService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [OAuthService],
    });
    service = TestBed.inject(OAuthService);

    Object.defineProperty(window, 'location', {
      value: { href: '' },
      writable: true,
      configurable: true,
    });
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('login()', () => {
    it.each<[OAuthProvider, string]>([
      ['google', `${environment.apiUrl}/auth/google`],
      ['github', `${environment.apiUrl}/auth/github`],
    ])('should redirect to the %s endpoint and return EMPTY', (provider, expectedUrl) => {
      let completed = false;

      service.login(provider).subscribe({
        next: () => {
          throw new Error('Observable should not emit a value');
        },
        error: () => {
          throw new Error('Observable should not throw an error');
        },
        complete: () => (completed = true),
      });

      expect(completed).toBe(true);
      expect(window.location.href).toBe(expectedUrl);
    });

    it('should return an error for unsupported providers', () => {
      const unsupportedProvider = 'facebook' as OAuthProvider;
      let caughtError: Error | null = null;

      service.login(unsupportedProvider).subscribe({
        next: () => {
          throw new Error('Observable should not emit a value');
        },
        complete: () => {
          throw new Error('Observable should not complete successfully');
        },
        error: (err: Error) => (caughtError = err),
      });

      expect(caughtError).toBeInstanceOf(Error);
      expect(caughtError!.message).toBe('Unsupported OAuth provider: facebook');
      expect(window.location.href).toBe('');
    });
  });
});
