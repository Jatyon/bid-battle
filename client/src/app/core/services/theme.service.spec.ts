import { TestBed } from '@angular/core/testing';
import { PLATFORM_ID } from '@angular/core';
import { StorageService } from './storage.service';
import { ThemeService } from './theme.service';

describe('ThemeService', () => {
  let storageMock: { get: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn> };
  let matchMediaMock: {
    matches: boolean;
    addEventListener: ReturnType<typeof vi.fn>;
    removeEventListener: ReturnType<typeof vi.fn>;
  };
  let matchMediaStub: ReturnType<typeof vi.fn>;

  const createService = (platformId = 'browser'): ThemeService => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: platformId },
        { provide: StorageService, useValue: storageMock },
      ],
    });
    return TestBed.inject(ThemeService);
  };

  beforeEach(() => {
    storageMock = { get: vi.fn().mockReturnValue(null), set: vi.fn() };

    matchMediaMock = {
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };

    matchMediaStub = vi.fn().mockReturnValue(matchMediaMock);
    vi.stubGlobal('matchMedia', matchMediaStub);
    vi.spyOn(document.documentElement, 'setAttribute');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('should be created', () => {
    const service = createService();
    expect(service).toBeTruthy();
  });

  describe('initial theme', () => {
    it('should use saved theme from storage when present', () => {
      storageMock.get.mockReturnValue('light');
      const service = createService();
      expect(service.currentTheme()).toBe('light');
    });

    it('should use dark theme when OS prefers dark and no saved preference', () => {
      const darkMatchMedia = {
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      };
      matchMediaStub.mockReturnValue(darkMatchMedia);
      storageMock.get.mockReturnValue(null);

      const service = createService();
      expect(service.currentTheme()).toBe('dark');
    });

    it('should use light theme when OS prefers light and no saved preference', () => {
      storageMock.get.mockReturnValue(null);
      const service = createService();
      expect(service.currentTheme()).toBe('light');
    });

    it('should register OS change listener when no saved preference', () => {
      storageMock.get.mockReturnValue(null);
      createService();
      expect(matchMediaMock.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));
    });

    it('should NOT register OS change listener when saved preference exists', () => {
      storageMock.get.mockReturnValue('dark');
      createService();
      expect(matchMediaMock.addEventListener).not.toHaveBeenCalled();
    });
  });

  describe('toggle()', () => {
    it('should switch from dark to light', () => {
      storageMock.get.mockReturnValue('dark');
      const service = createService();
      service.toggle();
      expect(service.currentTheme()).toBe('light');
    });

    it('should switch from light to dark', () => {
      storageMock.get.mockReturnValue('light');
      const service = createService();
      service.toggle();
      expect(service.currentTheme()).toBe('dark');
    });

    it('should persist the chosen theme to storage', () => {
      storageMock.get.mockReturnValue('dark');
      const service = createService();
      service.toggle();
      expect(storageMock.set).toHaveBeenCalledWith('theme', 'light');
    });

    it('should set data-theme attribute on <html>', () => {
      storageMock.get.mockReturnValue('dark');
      const service = createService();
      service.toggle();
      expect(document.documentElement.setAttribute).toHaveBeenCalledWith('data-theme', 'light');
    });

    it('should remove the media query listener on toggle', () => {
      storageMock.get.mockReturnValue(null);
      const service = createService();
      service.toggle();
      expect(matchMediaMock.removeEventListener).toHaveBeenCalled();
    });
  });

  describe('ngOnDestroy()', () => {
    it('should remove the media query listener on destroy', () => {
      storageMock.get.mockReturnValue(null);
      const service = createService();
      service.ngOnDestroy();
      expect(matchMediaMock.removeEventListener).toHaveBeenCalled();
    });
  });

  describe('SSR (non-browser platform)', () => {
    it('should not throw on server', () => {
      expect(() => createService('server')).not.toThrow();
    });

    it('should not call matchMedia on server', () => {
      createService('server');
      expect(window.matchMedia).not.toHaveBeenCalled();
    });
  });

  describe('OS theme changes (media query events)', () => {
    it('should update theme when OS switches to dark mode', () => {
      storageMock.get.mockReturnValue(null);
      const service = createService();

      const listener = matchMediaMock.addEventListener.mock.calls[0][1];

      listener({ matches: true } as MediaQueryListEvent);

      expect(service.currentTheme()).toBe('dark');
      expect(document.documentElement.setAttribute).toHaveBeenCalledWith('data-theme', 'dark');
    });

    it('should ignore OS changes if user saved a preference in the meantime', () => {
      storageMock.get.mockReturnValue(null);
      createService();

      const listener = matchMediaMock.addEventListener.mock.calls[0][1];

      storageMock.get.mockReturnValue('light');

      vi.mocked(document.documentElement.setAttribute).mockClear();

      listener({ matches: true } as MediaQueryListEvent);

      expect(document.documentElement.setAttribute).not.toHaveBeenCalled();
    });
  });
});
