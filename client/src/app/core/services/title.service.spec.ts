import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { AppTitleStrategy, TitleService } from './title.service';
import { RouterStateSnapshot } from '@angular/router';
import { TranslocoService } from '@jsverse/transloco';
import { of } from 'rxjs';

const APP_NAME = 'BidBattle';

describe('TitleService', () => {
  let service: TitleService;
  let titleApi: Title;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(TitleService);
    titleApi = TestBed.inject(Title);
    vi.spyOn(titleApi, 'setTitle');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('setTitle()', () => {
    it('should set title in format "Page | AppName"', () => {
      service.setTitle('Auctions');
      expect(titleApi.setTitle).toHaveBeenCalledWith(`Auctions | ${APP_NAME}`);
    });

    it('should set only AppName when page title is empty', () => {
      service.setTitle('');
      expect(titleApi.setTitle).toHaveBeenCalledWith(APP_NAME);
    });
  });

  describe('unreadCount', () => {
    it('should prepend the unread count to the title when greater than 0', () => {
      service.setTitle('Dashboard');
      service.setUnreadCount(5);

      expect(titleApi.setTitle).toHaveBeenCalledWith(`(5) Dashboard | ${APP_NAME}`);
    });

    it('should remove the unread count from the title when it drops to 0', () => {
      service.setTitle('Dashboard');
      service.setUnreadCount(3);
      service.setUnreadCount(0);

      expect(titleApi.setTitle).toHaveBeenCalledWith(`Dashboard | ${APP_NAME}`);
    });
  });

  describe('startBlink()', () => {
    it('should start blinking the title', async () => {
      vi.useFakeTimers();
      service.setTitle('Dashboard');
      service.startBlink('New notification!', 500);

      await vi.advanceTimersByTimeAsync(500);
      expect(titleApi.setTitle).toHaveBeenCalledWith('New notification!');

      await vi.advanceTimersByTimeAsync(500);
      expect(titleApi.setTitle).toHaveBeenCalledWith(`Dashboard | ${APP_NAME}`);

      service.stopBlink();
    });

    it('should not start a second blink interval if already blinking', async () => {
      vi.useFakeTimers();
      service.startBlink('Msg 1', 500);
      service.startBlink('Msg 2', 500);

      await vi.advanceTimersByTimeAsync(500);
      expect(titleApi.setTitle).not.toHaveBeenCalledWith('Msg 2');

      service.stopBlink();
    });
  });

  describe('stopBlink()', () => {
    it('should restore the normal title after stopping', async () => {
      vi.useFakeTimers();
      service.setTitle('Dashboard');
      service.startBlink('New notification!', 500);
      await vi.advanceTimersByTimeAsync(500);

      vi.clearAllMocks();
      vi.spyOn(titleApi, 'setTitle');

      service.stopBlink();

      expect(titleApi.setTitle).toHaveBeenCalledWith(`Dashboard | ${APP_NAME}`);
    });

    it('should do nothing when not blinking', () => {
      expect(() => service.stopBlink()).not.toThrow();
    });
  });

  describe('ngOnDestroy()', () => {
    it('should stop blinking on destroy', async () => {
      vi.useFakeTimers();
      service.startBlink('Msg', 500);
      service.ngOnDestroy();

      const callsBefore = (titleApi.setTitle as ReturnType<typeof vi.fn>).mock.calls.length;
      await vi.advanceTimersByTimeAsync(1000);
      const callsAfter = (titleApi.setTitle as ReturnType<typeof vi.fn>).mock.calls.length;

      expect(callsAfter).toBe(callsBefore);
    });
  });
});

describe('AppTitleStrategy', () => {
  let strategy: AppTitleStrategy;
  let titleServiceMock: { setTitle: ReturnType<typeof vi.fn> };
  let translocoMock: { selectTranslate: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    titleServiceMock = { setTitle: vi.fn() };
    translocoMock = { selectTranslate: vi.fn().mockReturnValue(of('Translated Title')) };

    TestBed.configureTestingModule({
      providers: [
        AppTitleStrategy,
        { provide: TitleService, useValue: titleServiceMock },
        { provide: TranslocoService, useValue: translocoMock },
      ],
    });

    strategy = TestBed.inject(AppTitleStrategy);
  });

  it('should clear the title if the route has no title defined', () => {
    vi.spyOn(strategy, 'buildTitle').mockReturnValue(undefined);

    strategy.updateTitle({} as RouterStateSnapshot);

    expect(titleServiceMock.setTitle).toHaveBeenCalledWith('');
    expect(translocoMock.selectTranslate).not.toHaveBeenCalled();
  });

  it('should translate the route title and pass it to TitleService', () => {
    vi.spyOn(strategy, 'buildTitle').mockReturnValue('route.dashboard.title');

    strategy.updateTitle({} as RouterStateSnapshot);

    expect(translocoMock.selectTranslate).toHaveBeenCalledWith('route.dashboard.title');
    expect(titleServiceMock.setTitle).toHaveBeenCalledWith('Translated Title');
  });
});
