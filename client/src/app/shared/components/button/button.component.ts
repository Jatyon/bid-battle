import { Component, input, output, computed } from '@angular/core';
import { SpinnerComponent } from '../spinner/spinner.component';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

@Component({
  selector: 'app-button',
  templateUrl: './button.component.html',
  styleUrl: './button.component.scss',
  imports: [SpinnerComponent],
})
export class ButtonComponent {
  readonly variant = input<ButtonVariant>('primary');
  readonly size = input<ButtonSize>('md');
  readonly loading = input(false);
  readonly disabled = input(false);
  readonly type = input<'button' | 'submit' | 'reset'>('button');
  readonly fullWidth = input(false);

  readonly clicked = output<MouseEvent>();

  readonly isDisabled = computed(() => this.disabled() || this.loading());

  readonly classes = computed(() =>
    [
      'btn',
      `btn--${this.variant()}`,
      `btn--${this.size()}`,
      this.fullWidth() ? 'btn--full' : '',
      this.loading() ? 'btn--loading' : '',
    ]
      .filter(Boolean)
      .join(' '),
  );

  onClick(event: MouseEvent): void {
    if (!this.isDisabled()) this.clicked.emit(event);
  }
}
