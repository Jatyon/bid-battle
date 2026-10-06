import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  DOCUMENT,
} from '@angular/core';
import { NgClass } from '@angular/common';
import { resolveImageUrl } from '@core/utils';
import { LucideAngularModule, User, UserX } from 'lucide-angular';

export type AvatarSize = 'sm' | 'md' | 'lg' | 'xl' | '2xl';

@Component({
  selector: 'app-avatar',
  imports: [LucideAngularModule, NgClass],
  templateUrl: './avatar.component.html',
  styleUrl: './avatar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AvatarComponent {
  readonly imageUrl = input<string | null | undefined>();
  readonly firstName = input<string | null | undefined>();
  readonly lastName = input<string | null | undefined>();
  readonly size = input<AvatarSize>('md');
  readonly isDeleted = input<boolean>(false);
  readonly alt = input<string>('');

  private readonly document = inject(DOCUMENT);

  readonly userIcon = User;
  readonly userXIcon = UserX;

  readonly resolvedUrl = computed(() => resolveImageUrl(this.imageUrl(), this.document.baseURI));

  readonly initials = computed(() => {
    const f = this.firstName()?.trim();
    const l = this.lastName()?.trim();

    if (f && l) return (f.charAt(0) + l.charAt(0)).toUpperCase();
    else if (f) return f.slice(0, 2).toUpperCase();
    else if (l) return l.slice(0, 2).toUpperCase();

    return null;
  });

  readonly sizeClass = computed(() => `app-avatar--${this.size()}`);
}
