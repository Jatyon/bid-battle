import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type BadgeVariant = 'primary' | 'success' | 'warning' | 'danger' | 'neutral' | 'accent' | 'gold' | 'info';
export type BadgeAppearance = 'subtle' | 'solid' | 'outline';
export type BadgeSize = 'xs' | 'sm' | 'md' | 'lg';
export type BadgeRounded = 'full' | 'md' | 'sm';

@Component({
  selector: 'app-badge',
  templateUrl: './badge.component.html',
  styleUrl: './badge.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BadgeComponent {
  readonly variant = input<BadgeVariant>('primary');
  readonly appearance = input<BadgeAppearance>('subtle');
  readonly size = input<BadgeSize>('sm');
  readonly rounded = input<BadgeRounded>('full');
  readonly dot = input(false);
  readonly pulse = input(false);
  readonly uppercase = input(false);
  readonly label = input<string | null>(null);

  readonly classes = computed(() =>
    [
      'badge',
      `badge--${this.variant()}`,
      `badge--${this.appearance()}`,
      `badge--${this.size()}`,
      `badge--round-${this.rounded()}`,
      this.uppercase() ? 'badge--uppercase' : '',
    ]
      .filter(Boolean)
      .join(' '),
  );
}
