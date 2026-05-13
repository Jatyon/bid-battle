import { TestBed } from '@angular/core/testing';
import { LoadingService } from './loading.service';

describe('LoadingService', () => {
  let service: LoadingService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(LoadingService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('isLoading', () => {
    it('should be false initially', () => {
      expect(service.isLoading()).toBe(false);
    });

    it('should be true after start()', () => {
      service.start();
      expect(service.isLoading()).toBe(true);
    });

    it('should remain true when multiple requests are active', () => {
      service.start();
      service.start();
      service.stop();
      expect(service.isLoading()).toBe(true);
    });

    it('should be false after all requests have stopped', () => {
      service.start();
      service.start();
      service.stop();
      service.stop();
      expect(service.isLoading()).toBe(false);
    });
  });

  describe('stop()', () => {
    it('should not go below 0', () => {
      service.stop();
      service.stop();
      expect(service.isLoading()).toBe(false);
    });
  });
});
