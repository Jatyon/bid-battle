import { TestBed } from '@angular/core/testing';
import { TokenService } from './token.service';
import { firstValueFrom } from 'rxjs';

describe('TokenService', () => {
  let service: TokenService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(TokenService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('accessToken', () => {
    it('should be null initially', () => {
      expect(service.accessToken()).toBeNull();
    });

    it('should hold token after setAccessToken()', () => {
      service.setAccessToken('my-token');
      expect(service.accessToken()).toBe('my-token');
    });

    it('should be null after clearAccessToken()', () => {
      service.setAccessToken('my-token');
      service.clearAccessToken();
      expect(service.accessToken()).toBeNull();
    });
  });

  describe('isRefreshing', () => {
    it('should be false initially', () => {
      expect(service.isRefreshing).toBe(false);
    });

    it('should be true after startRefresh()', () => {
      service.startRefresh();
      expect(service.isRefreshing).toBe(true);
    });

    it('should be false after resolveRefresh()', () => {
      service.startRefresh();
      service.resolveRefresh('new-token');
      expect(service.isRefreshing).toBe(false);
    });

    it('should update accessToken after resolveRefresh()', () => {
      service.startRefresh();
      service.resolveRefresh('new-token');
      expect(service.accessToken()).toBe('new-token');
    });

    it('should be false after rejectRefresh()', () => {
      service.startRefresh();
      service.rejectRefresh();
      expect(service.isRefreshing).toBe(false);
    });
  });

  describe('waitForToken()', () => {
    it('should immediately return current token when not refreshing', async () => {
      service.setAccessToken('current-token');
      const token = await firstValueFrom(service.waitForToken());
      expect(token).toBe('current-token');
    });

    it('should wait and emit resolved token when refresh is in progress', async () => {
      service.startRefresh();

      const promise = firstValueFrom(service.waitForToken());
      service.resolveRefresh('resolved-token');

      const token = await promise;
      expect(token).toBe('resolved-token');
    });

    it('should emit null when refresh is rejected while waiting', async () => {
      service.startRefresh();

      const promise = firstValueFrom(service.waitForToken());
      service.rejectRefresh();

      const token = await promise;
      expect(token).toBeNull();
    });
  });
});
