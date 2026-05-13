import { TestBed } from '@angular/core/testing';
import { NotificationType } from '@core/enums';
import { TranslocoService } from '@jsverse/transloco';
import { NotificationService } from './notification.service';
import { of } from 'rxjs';

describe('NotificationService', () => {
  let service: NotificationService;
  let selectTranslateSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    selectTranslateSpy = vi.fn().mockImplementation((key: string) => of(key));
    const translocoMock = { selectTranslate: selectTranslateSpy };

    TestBed.configureTestingModule({
      providers: [{ provide: TranslocoService, useValue: translocoMock }],
    });

    service = TestBed.inject(NotificationService);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('notifications signal', () => {
    it('should start empty', () => {
      expect(service.notifications()).toHaveLength(0);
    });
  });

  describe('success()', () => {
    it('should add a success notification', () => {
      service.success('my.key');
      expect(service.notifications()).toHaveLength(1);
      expect(service.notifications()[0].type).toBe(NotificationType.Success);
    });

    it('should translate the message via TranslocoService', () => {
      service.success('my.key');
      expect(selectTranslateSpy).toHaveBeenCalledWith('my.key', undefined);
      expect(service.notifications()[0].message).toBe('my.key');
    });

    it('should add raw message when translate=false', () => {
      service.success('Raw message', false);
      expect(selectTranslateSpy).not.toHaveBeenCalled();
      expect(service.notifications()[0].message).toBe('Raw message');
    });
  });

  describe('error()', () => {
    it('should add an error notification', () => {
      service.error('error.key');
      expect(service.notifications()[0].type).toBe(NotificationType.Error);
    });
  });

  describe('warning()', () => {
    it('should add a warning notification', () => {
      service.warning('warning.key');
      expect(service.notifications()[0].type).toBe(NotificationType.Warning);
    });
  });

  describe('info()', () => {
    it('should add an info notification', () => {
      service.info('info.key');
      expect(service.notifications()[0].type).toBe(NotificationType.Info);
    });
  });

  describe('deduplication', () => {
    it('should not add a duplicate notification', () => {
      service.success('same.key');
      service.success('same.key');
      expect(service.notifications()).toHaveLength(1);
    });

    it('should add notifications with different types separately', () => {
      service.success('same.key');
      service.error('same.key');
      expect(service.notifications()).toHaveLength(2);
    });

    it('should reset the auto-dismiss timer for duplicate notifications', async () => {
      vi.useFakeTimers();
      service.success('msg', false, 1000);

      await vi.advanceTimersByTimeAsync(500);

      service.success('msg', false, 1000);

      await vi.advanceTimersByTimeAsync(500);

      expect(service.notifications()[0].isLeaving).toBeFalsy();

      await vi.advanceTimersByTimeAsync(500);
      expect(service.notifications()[0].isLeaving).toBe(true);
    });

    it('should resurrect a leaving notification if triggered again', async () => {
      vi.useFakeTimers();
      service.success('resurrect-me', false, 1000);

      await vi.advanceTimersByTimeAsync(1000);
      expect(service.notifications()[0].isLeaving).toBe(true);

      service.success('resurrect-me', false, 1000);

      expect(service.notifications()[0].isLeaving).toBe(false);

      await vi.advanceTimersByTimeAsync(240);

      expect(service.notifications()).toHaveLength(1);
    });
  });

  describe('dismiss()', () => {
    it('should mark notification as leaving', () => {
      service.success('msg', false);
      const id = service.notifications()[0].id;

      service.dismiss(id);

      expect(service.notifications()[0].isLeaving).toBe(true);
    });

    it('should do nothing for unknown id', () => {
      service.success('msg', false);
      expect(() => service.dismiss('non-existent-id')).not.toThrow();
      expect(service.notifications()).toHaveLength(1);
    });
  });

  describe('max notifications limit', () => {
    it('should keep at most 5 notifications', () => {
      for (let i = 0; i < 7; i++) {
        service.success(`msg-${i}`, false);
      }
      expect(service.notifications()).toHaveLength(5);
    });
  });

  describe('auto-dismiss', () => {
    it('should remove notification after duration', async () => {
      vi.useFakeTimers();
      service.success('msg', false, 1000);
      expect(service.notifications()).toHaveLength(1);

      await vi.advanceTimersByTimeAsync(1000);
      expect(service.notifications()[0].isLeaving).toBe(true);

      await vi.advanceTimersByTimeAsync(240);
      expect(service.notifications()).toHaveLength(0);
    });

    it('should not auto-dismiss when duration is 0', async () => {
      vi.useFakeTimers();
      service.success('msg', false, 0);
      await vi.advanceTimersByTimeAsync(10000);
      expect(service.notifications()).toHaveLength(1);
    });
  });
});
