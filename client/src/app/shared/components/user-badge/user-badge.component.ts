import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AvatarComponent, AvatarSize } from '../avatar/avatar.component';
import { TranslocoDirective } from '@jsverse/transloco';

interface BadgeUser {
  id: number;
  firstName?: string | null;
  lastName?: string | null;
  avatar?: string | null;
  isDeleted?: boolean;
}

@Component({
  selector: 'app-user-badge',
  imports: [RouterLink, AvatarComponent, TranslocoDirective],
  templateUrl: './user-badge.component.html',
  styleUrl: './user-badge.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserBadgeComponent {
  readonly user = input.required<BadgeUser | null | undefined>();
  readonly abbreviateLastName = input<boolean>(false);
  readonly isLink = input<boolean>(true);
  readonly size = input<AvatarSize>('sm');
  readonly variant = input<'primary' | 'success' | 'neutral' | 'default'>('default');

  readonly formattedName = computed(() => {
    const u = this.user();

    if (!u) return '';
    if (!u.firstName && !u.lastName) return '';

    const first = u.firstName?.trim() || '';
    const last = u.lastName?.trim() || '';

    if (this.abbreviateLastName() && last) return `${first} ${last.charAt(0)}.`.trim();

    return `${first} ${last}`.trim();
  });
}
