import { HttpRequest, HttpResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { LanguageService } from '@core/services/language.service';
import { Language } from '@core/enums';
import { languageInterceptor } from './language.interceptor';
import { firstValueFrom, of } from 'rxjs';

describe('languageInterceptor', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: LanguageService,
          useValue: {
            getAcceptLanguageHeader: vi.fn().mockReturnValue(Language.PL),
          },
        },
      ],
    });
  });

  it('should set Accept-Language from LanguageService', async () => {
    const req = new HttpRequest('GET', '/api/v1/auth/me');
    let capturedReq: HttpRequest<unknown> | undefined;

    await firstValueFrom(
      TestBed.runInInjectionContext(() =>
        languageInterceptor(req, (r) => {
          capturedReq = r;
          return of(new HttpResponse({ status: 200 }));
        }),
      ),
    );

    expect(capturedReq?.headers.get('Accept-Language')).toBe(Language.PL);
  });
});
