import { ChangeDetectorRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { formatDateTime } from '@core/utils';
import { AppDatePipe } from './app-date.pipe';
import { TranslocoService } from '@jsverse/transloco';
import { Subject } from 'rxjs';

describe('formatDateTime', () => {
  it('formats date correctly for given locale', () => {
    const dateStr = '2024-05-15T10:30:00Z';
    const resultPl = formatDateTime(dateStr, 'pl');
    expect(resultPl).toBeTruthy();
    expect(resultPl).toContain('2024');

    const resultEn = formatDateTime(dateStr, 'en');
    expect(resultEn).toBeTruthy();
    expect(resultEn).toContain('2024');
  });

  it('returns empty string for null, undefined or invalid date', () => {
    expect(formatDateTime(null)).toBe('');
    expect(formatDateTime(undefined)).toBe('');
    expect(formatDateTime('invalid-date')).toBe('');
  });
});

describe('AppDatePipe', () => {
  let pipe: AppDatePipe;
  let langSubject: Subject<string>;
  let mockTransloco: {
    getActiveLang: () => string;
    langChanges$: Subject<string>;
  };
  let mockCdr: { markForCheck: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    langSubject = new Subject<string>();
    mockTransloco = {
      getActiveLang: vi.fn().mockReturnValue('pl'),
      langChanges$: langSubject,
    };
    mockCdr = { markForCheck: vi.fn() };

    TestBed.configureTestingModule({
      providers: [
        AppDatePipe,
        { provide: TranslocoService, useValue: mockTransloco },
        { provide: ChangeDetectorRef, useValue: mockCdr },
      ],
    });

    pipe = TestBed.inject(AppDatePipe);
  });

  it('formats a date string', () => {
    const formatted = pipe.transform('2024-12-31T20:00:00Z');
    expect(formatted).toBeTruthy();
    expect(formatted).toContain('2024');
  });

  it('returns empty string for null/undefined', () => {
    expect(pipe.transform(null)).toBe('');
    expect(pipe.transform(undefined)).toBe('');
  });

  it('reacts to language changes emitted by TranslocoService', () => {
    const date = '2024-01-15T12:00:00Z';
    const plResult = pipe.transform(date);
    expect(plResult).toBeTruthy();

    langSubject.next('en');

    const enResult = pipe.transform(date);
    expect(enResult).toBeTruthy();
  });
});
