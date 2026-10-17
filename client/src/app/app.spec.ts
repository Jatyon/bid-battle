import { provideRouter, Router, RouterOutlet } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { PopupComponent, ToastComponent } from '@app/shared';
import { NotificationService } from '@core/services';
import { AuctionOutbidEvent, BidSocketService } from '@features/auctions';
import { App } from './app';
import { provideTransloco, TranslocoLoader, Translation } from '@jsverse/transloco';
import { Observable, of, Subject } from 'rxjs';

class TestTranslocoLoader implements TranslocoLoader {
  getTranslation(): Observable<Translation> {
    return of({ TOAST: { CLOSE: 'Close' } });
  }
}

describe('App', () => {
  beforeEach(async () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    );

    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideTransloco({
          config: { availableLangs: ['en'], defaultLang: 'en' },
          loader: TestTranslocoLoader,
        }),
      ],
    }).compileComponents();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should contain a RouterOutlet for routing', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    const routerOutlet = fixture.debugElement.query(By.directive(RouterOutlet));
    expect(routerOutlet).toBeTruthy();
  });

  it('should render the global ToastComponent', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    const toastComponent = fixture.debugElement.query(By.directive(ToastComponent));
    expect(toastComponent).toBeTruthy();
  });

  it('should render the global PopupComponent', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    const popupComponent = fixture.debugElement.query(By.directive(PopupComponent));
    expect(popupComponent).toBeTruthy();
  });

  it('should display warning notification when onOutbid event fires and user is not on that auction page', () => {
    const socketService = TestBed.inject(BidSocketService);
    const notificationService = TestBed.inject(NotificationService);
    const outbidSubject = new Subject<AuctionOutbidEvent>();
    vi.spyOn(socketService, 'onOutbid').mockReturnValue(outbidSubject.asObservable());
    const warningSpy = vi.spyOn(notificationService, 'warning').mockImplementation(() => undefined);

    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    outbidSubject.next({
      auctionId: 123,
      newAmount: 450,
      auctionTitle: 'Super Car',
      timestamp: '2026-10-15T10:00:00.000Z',
    });

    expect(warningSpy).toHaveBeenCalled();
  });

  it('should not display warning notification when onOutbid event fires for the currently viewed auction (activeAuctionId)', () => {
    const socketService = TestBed.inject(BidSocketService);
    const notificationService = TestBed.inject(NotificationService);
    const outbidSubject = new Subject<AuctionOutbidEvent>();
    vi.spyOn(socketService, 'onOutbid').mockReturnValue(outbidSubject.asObservable());
    vi.spyOn(socketService, 'activeAuctionId').mockReturnValue(123);
    const warningSpy = vi.spyOn(notificationService, 'warning').mockImplementation(() => undefined);

    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    outbidSubject.next({
      auctionId: 123,
      newAmount: 450,
      auctionTitle: 'Super Car',
      timestamp: '2026-10-15T10:00:00.000Z',
    });

    expect(warningSpy).not.toHaveBeenCalled();
  });

  it('should not display warning notification when router URL matches the outbid auction', () => {
    const socketService = TestBed.inject(BidSocketService);
    const notificationService = TestBed.inject(NotificationService);
    const router = TestBed.inject(Router);
    Object.defineProperty(router, 'url', { value: '/auctions/123', configurable: true });

    const outbidSubject = new Subject<AuctionOutbidEvent>();
    vi.spyOn(socketService, 'onOutbid').mockReturnValue(outbidSubject.asObservable());
    vi.spyOn(socketService, 'activeAuctionId').mockReturnValue(null);
    const warningSpy = vi.spyOn(notificationService, 'warning').mockImplementation(() => undefined);

    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    outbidSubject.next({
      auctionId: 123,
      newAmount: 450,
      auctionTitle: 'Super Car',
      timestamp: '2026-10-15T10:00:00.000Z',
    });

    expect(warningSpy).not.toHaveBeenCalled();
  });
});
