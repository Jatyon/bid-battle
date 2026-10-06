import { ChangeDetectorRef, DestroyRef, Pipe, PipeTransform, inject } from '@angular/core';
import { formatDateTime } from '@core/utils';
import { TranslocoService } from '@jsverse/transloco';

@Pipe({
  name: 'appDate',
})
export class AppDatePipe implements PipeTransform {
  private readonly transloco = inject(TranslocoService, { optional: true });
  private readonly cdr = inject(ChangeDetectorRef, { optional: true });
  private readonly destroyRef = inject(DestroyRef, { optional: true });

  constructor() {
    const sub = this.transloco?.langChanges$.subscribe(() => {
      this.cdr?.markForCheck();
    });
    this.destroyRef?.onDestroy(() => sub?.unsubscribe());
  }

  transform(
    value?: string | Date | null,
    options: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' },
  ): string {
    const currentLang = this.transloco?.getActiveLang() || 'en';
    return formatDateTime(value, currentLang, options);
  }
}
