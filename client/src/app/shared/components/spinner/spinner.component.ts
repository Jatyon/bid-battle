import { Component, input, inject, computed } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';

export type SpinnerSize = 'sm' | 'md' | 'lg';

@Component({
  selector: 'app-spinner',
  templateUrl: './spinner.component.html',
  styleUrl: './spinner.component.scss',
})
export class SpinnerComponent {
  readonly size = input<SpinnerSize>('md');
  readonly label = input<string | null>(null);

  private readonly transloco = inject(TranslocoService);

  readonly ariaLabel = computed(() => this.label() ?? this.transloco.translate('SPINNER.LOADING'));
}
