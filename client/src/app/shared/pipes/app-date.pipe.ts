import { ChangeDetectorRef, DestroyRef, Pipe, PipeTransform, inject } from '@angular/core';
import { formatDateTime } from '@core/utils';
import { TranslocoService } from '@jsverse/transloco';

@Pipe({
  name: 'appDate',
  pure: false,
})
export class AppDatePipe implements PipeTransform {
  private readonly transloco = inject(TranslocoService, { optional: true });
  private readonly cdr = inject(ChangeDetectorRef, { optional: true });
  private readonly destroyRef = inject(DestroyRef, { optional: true });

  private currentLang = this.transloco?.getActiveLang() || 'en';
  private lastValue?: string | Date | null;
  private lastOptions?: Intl.DateTimeFormatOptions;
  private lastFormatted = '';

  constructor() {
    const sub = this.transloco?.langChanges$.subscribe((lang) => {
      if (this.currentLang !== lang) {
        this.currentLang = lang;
        this.lastFormatted = formatDateTime(this.lastValue, this.currentLang, this.lastOptions);
        this.cdr?.markForCheck();
      }
    });

    this.destroyRef?.onDestroy(() => sub?.unsubscribe());
  }

  transform(
    value?: string | Date | null,
    options: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' }
  ): string {
    if (value === this.lastValue && options === this.lastOptions) {
      return this.lastFormatted;
    }

    this.lastValue = value;
    this.lastOptions = options;
    this.lastFormatted = formatDateTime(value, this.currentLang, options);
    return this.lastFormatted;
  }
}
