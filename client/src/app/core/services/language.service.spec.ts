import { TestBed } from '@angular/core/testing';
import { Language } from '@core/enums';
import { StorageService } from './storage.service';
import { LanguageService } from './language.service';
import { TranslocoService } from '@jsverse/transloco';

describe('LanguageService', () => {
  let service: LanguageService;
  let storageMock: { get: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn> };
  let translocoMock: {
    getActiveLang: ReturnType<typeof vi.fn>;
    setActiveLang: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    storageMock = {
      get: vi.fn().mockReturnValue(null),
      set: vi.fn(),
    };

    translocoMock = {
      getActiveLang: vi.fn().mockReturnValue(Language.EN),
      setActiveLang: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        LanguageService,
        { provide: StorageService, useValue: storageMock },
        { provide: TranslocoService, useValue: translocoMock },
      ],
    });

    service = TestBed.inject(LanguageService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('init()', () => {
    it('should use saved language from storage', () => {
      storageMock.get.mockReturnValue(Language.PL);

      service.init();

      expect(translocoMock.setActiveLang).toHaveBeenCalledWith(Language.PL);
    });

    it('should detect Polish from navigator when nothing is saved', () => {
      vi.stubGlobal('navigator', { language: 'pl-PL', languages: ['pl-PL', 'en-US'] });

      service.init();

      expect(translocoMock.setActiveLang).toHaveBeenCalledWith(Language.PL);

      vi.unstubAllGlobals();
    });

    it('should fall back to English for unsupported browser languages', () => {
      vi.stubGlobal('navigator', { language: 'de-DE', languages: ['de-DE'] });
      translocoMock.getActiveLang.mockReturnValue(Language.PL);

      service.init();

      expect(translocoMock.setActiveLang).toHaveBeenCalledWith(Language.EN);

      vi.unstubAllGlobals();
    });
  });

  describe('setLanguage()', () => {
    it('should update transloco and persist preference', () => {
      service.setLanguage(Language.PL);

      expect(translocoMock.setActiveLang).toHaveBeenCalledWith(Language.PL);
      expect(storageMock.set).toHaveBeenCalledWith('language', Language.PL);
    });
  });

  describe('getAcceptLanguageHeader()', () => {
    it('should return active language code', () => {
      translocoMock.getActiveLang.mockReturnValue(Language.PL);

      expect(service.getAcceptLanguageHeader()).toBe(Language.PL);
    });
  });
});
