import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ButtonComponent } from '@app/shared';
import { NotificationService } from '@core/services';
import { User } from '@core/models';
import { ProfileService } from '../../services/profile.service';
import { TranslocoDirective } from '@jsverse/transloco';
import { finalize } from 'rxjs';

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const ACCEPTED_TYPES = ['image/jpeg', 'image/png'];

@Component({
  selector: 'app-avatar-upload',
  imports: [ButtonComponent, TranslocoDirective],
  templateUrl: './avatar-upload.component.html',
  styleUrl: './avatar-upload.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AvatarUploadComponent {
  private readonly profileService = inject(ProfileService);
  private readonly notifications = inject(NotificationService);
  private readonly destroyRef = inject(DestroyRef);

  readonly user = input.required<User | null>();
  readonly userUpdated = output<User>();

  private readonly fileInput = viewChild<ElementRef<HTMLInputElement>>('fileInput');

  readonly isUploading = signal(false);
  readonly isRemoving = signal(false);

  readonly initials = computed(() => {
    const user = this.user();
    if (!user) return '';
    return `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`.toUpperCase();
  });

  openFilePicker(): void {
    this.fileInput()?.nativeElement.click();
  }

  onFileSelected(event: Event): void {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    target.value = '';

    if (!file) return;

    if (!ACCEPTED_TYPES.includes(file.type)) {
      this.notifications.error('PROFILE.AVATAR.ERROR_TYPE');
      return;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      this.notifications.error('PROFILE.AVATAR.ERROR_SIZE');
      return;
    }

    this.isUploading.set(true);
    this.profileService
      .uploadAvatar(file)
      .pipe(
        finalize(() => this.isUploading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (user) => this.userUpdated.emit(user),
      });
  }

  removeAvatar(): void {
    if (!this.user()?.avatar) return;

    this.isRemoving.set(true);
    this.profileService
      .deleteAvatar()
      .pipe(
        finalize(() => this.isRemoving.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => this.userUpdated.emit({ ...this.user()!, avatar: undefined }),
      });
  }
}
