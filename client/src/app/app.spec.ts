import { provideRouter, RouterOutlet } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { PopupComponent, ToastComponent } from '@shared/index';
import { provideTransloco, TranslocoLoader, Translation } from '@jsverse/transloco';
import { Observable, of } from 'rxjs';
import { App } from './app';

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
});
