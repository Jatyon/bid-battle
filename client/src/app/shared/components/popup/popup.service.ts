import { inject, Injectable, signal } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { PopupConfig, PopupState } from './popup.types';

/**
 * PopupService – globally available service for opening modal pop-ups.
 */
@Injectable({ providedIn: 'root' })
export class PopupService {
  readonly state = signal<PopupState | null>(null);
  private readonly transloco = inject(TranslocoService);

  open(config: PopupConfig): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      this.state.set({
        title: config.title,
        message: config.message,
        type: config.type ?? 'info',
        mode: config.mode ?? 'info',
        confirmText: config.confirmText ?? this.transloco.translate('POPUP.CONFIRM'),
        cancelText: config.cancelText ?? this.transloco.translate('POPUP.CANCEL'),
        resolve,
      });
    });
  }

  close(confirmed: boolean): void {
    const current = this.state();

    if (!current) return;

    this.state.set(null);
    current.resolve(confirmed);
  }
}
