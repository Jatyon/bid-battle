import { TestBed } from '@angular/core/testing';
import { NotificationService } from '@core/index';
import { GlobalErrorHandler } from './global-error-handler';

const setup = () => {
  const notificationsMock = { error: vi.fn() };

  TestBed.configureTestingModule({
    providers: [GlobalErrorHandler, { provide: NotificationService, useValue: notificationsMock }],
  });

  return {
    handler: TestBed.inject(GlobalErrorHandler),
    notifications: notificationsMock,
  };
};

describe('GlobalErrorHandler', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockReturnValue();
    vi.stubGlobal('ngDevMode', false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('logging', () => {
    it('should log the error to the console', () => {
      const { handler } = setup();
      const err = new Error('boom');

      handler.handleError(err);

      expect(console.error).toHaveBeenCalledWith('[GlobalErrorHandler] Unhandled error:', err);
    });

    it('should log non-Error values (strings, objects) too', () => {
      const { handler } = setup();

      try {
        handler.handleError('something went wrong');
      } catch {
        /* ignore */
      }

      expect(console.error).toHaveBeenCalledWith(
        '[GlobalErrorHandler] Unhandled error:',
        'something went wrong',
      );
    });
  });

  describe('notifications', () => {
    it('should call notifications.error with the ERRORS.UNEXPECTED key', () => {
      const { handler, notifications } = setup();

      try {
        handler.handleError(new Error('boom'));
      } catch {
        /* ignore */
      }

      expect(notifications.error).toHaveBeenCalledWith('ERRORS.UNEXPECTED', true);
    });

    it('should always show the toast regardless of error type', () => {
      const { handler, notifications } = setup();

      try {
        handler.handleError('plain string error');
      } catch {
        /* ignore */
      }
      try {
        handler.handleError({ code: 42 });
      } catch {
        /* ignore */
      }

      expect(notifications.error).toHaveBeenCalledTimes(2);
    });
  });

  describe('in dev mode (ngDevMode = true)', () => {
    beforeEach(() => {
      vi.stubGlobal('ngDevMode', true);
    });
    it('should re-throw the original error', () => {
      const { handler } = setup();
      const err = new Error('dev error');

      expect(() => handler.handleError(err)).toThrow(err);
    });

    it('should re-throw non-Error values as-is', () => {
      const { handler } = setup();

      expect(() => handler.handleError('raw string')).toThrow('raw string');
    });
  });

  describe('in production mode (ngDevMode = false)', () => {
    beforeEach(() => {
      vi.stubGlobal('ngDevMode', false);
    });

    it('should NOT re-throw the error', () => {
      const { handler } = setup();

      expect(() => handler.handleError(new Error('prod error'))).not.toThrow();
    });

    it('should still show the toast even when not re-throwing', () => {
      const { handler, notifications } = setup();

      handler.handleError(new Error('silent error'));

      expect(notifications.error).toHaveBeenCalledOnce();
    });
  });
});
