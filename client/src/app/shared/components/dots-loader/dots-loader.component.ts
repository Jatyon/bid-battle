import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';

@Component({
  selector: 'app-dots-loader',
  templateUrl: './dots-loader.component.html',
  styleUrl: './dots-loader.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DotsLoaderComponent {
  readonly label = input<string | null>(null);

  private readonly transloco = inject(TranslocoService);

  readonly ariaLabel = computed(() => this.label() ?? this.transloco.translate('SPINNER.LOADING'));
}
