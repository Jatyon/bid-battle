import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { ButtonComponent, InputComponent, PopupService } from '@app/shared';
import { AuthService, NotificationService } from '@core/services';
import type { UpdateProfileRequest, User } from '@core/models';
import {
  passwordRepeatMatchValidator,
  resolveHttpError,
  strongPasswordValidators,
} from '@features/auth/utils';
import { AvatarUploadComponent } from '@features/profile/components';
import { ProfileService } from '@features/profile/services';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { LucideAngularModule, UserRound, Package, Wallet, Settings } from 'lucide-angular';
import { finalize } from 'rxjs';

@Component({
  selector: 'app-profile',
  imports: [
    ReactiveFormsModule,
    TranslocoDirective,
    InputComponent,
    ButtonComponent,
    AvatarUploadComponent,
    LucideAngularModule,
  ],
  templateUrl: './profile.html',
  styleUrl: './profile.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfilePage {
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly authService = inject(AuthService);
  private readonly profileService = inject(ProfileService);
  private readonly notifications = inject(NotificationService);
  private readonly popup = inject(PopupService);
  private readonly transloco = inject(TranslocoService);
  private readonly destroyRef = inject(DestroyRef);

  readonly profileIcon = UserRound;
  readonly auctionsIcon = Package;
  readonly bidsIcon = Wallet;
  readonly preferencesIcon = Settings;

  readonly currentUser = this.authService.currentUser;

  readonly isSavingProfile = signal(false);
  readonly isChangingPassword = signal(false);
  readonly isDeletingAccount = signal(false);

  readonly profileForm = this.fb.group({
    firstName: [this.currentUser()?.firstName ?? '', [Validators.required]],
    lastName: [this.currentUser()?.lastName ?? '', [Validators.required]],
    email: [{ value: this.currentUser()?.email ?? '', disabled: true }],
  });

  readonly passwordForm = this.fb.group({
    currentPassword: ['', [Validators.required]],
    password: ['', strongPasswordValidators],
    passwordRepeat: ['', [Validators.required, passwordRepeatMatchValidator]],
  });

  onProfileSubmit(): void {
    if (this.profileForm.invalid) {
      this.profileForm.markAllAsTouched();
      return;
    }

    if (this.isSavingProfile()) return;
    this.isSavingProfile.set(true);

    const { firstName, lastName } = this.profileForm.getRawValue();
    const request: UpdateProfileRequest = { firstName, lastName };

    this.profileService
      .updateProfile(request)
      .pipe(
        finalize(() => this.isSavingProfile.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (user) => {
          this.authService.updateUser(user);
          this.notifications.success('PROFILE.INFO.SAVE_SUCCESS');
        },
      });
  }

  onPasswordSubmit(): void {
    if (this.passwordForm.invalid) {
      this.passwordForm.markAllAsTouched();
      return;
    }

    if (this.isChangingPassword()) return;
    this.isChangingPassword.set(true);

    const { currentPassword, password, passwordRepeat } = this.passwordForm.getRawValue();

    this.authService
      .changePassword({ currentPassword, password, passwordRepeat })
      .pipe(
        finalize(() => this.isChangingPassword.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          this.passwordForm.reset();
          this.notifications.success('PROFILE.PASSWORD.SUCCESS');
        },
        error: (err: HttpErrorResponse) => {
          this.passwordForm.controls.currentPassword.setErrors({
            serverError: resolveHttpError(err),
          });
        },
      });
  }

  onUserUpdated(user: User): void {
    this.authService.updateUser(user);
  }

  async onDeleteAccount(): Promise<void> {
    const confirmed = await this.popup.open({
      title: this.transloco.translate('PROFILE.DANGER_ZONE.CONFIRM_TITLE'),
      message: this.transloco.translate('PROFILE.DANGER_ZONE.CONFIRM_MESSAGE'),
      type: 'error',
      mode: 'confirm',
    });

    if (!confirmed || this.isDeletingAccount()) return;
    this.isDeletingAccount.set(true);

    this.profileService
      .deleteAccount()
      .pipe(
        finalize(() => this.isDeletingAccount.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => this.authService.logout(),
      });
  }
}
