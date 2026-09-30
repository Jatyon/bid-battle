import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ButtonComponent,
  InputComponent,
  PopupService,
  SelectComponent,
  SelectOption,
  SwitchComponent,
} from '@app/shared';
import { AuthService, LanguageService, NotificationService } from '@core/services';
import type { UpdateProfileRequest, User } from '@core/models';
import { Language } from '@core/enums';
import {
  passwordRepeatMatchValidator,
  resolveHttpError,
  strongPasswordValidators,
} from '@features/auth/utils';
import { ProfilePreferences, ProfileService } from '@features/profile/services';
import { AvatarUploadComponent } from '@features/profile/components';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { finalize } from 'rxjs';

@Component({
  selector: 'app-profile',
  imports: [
    ReactiveFormsModule,
    TranslocoDirective,
    InputComponent,
    ButtonComponent,
    AvatarUploadComponent,
    SelectComponent,
    SwitchComponent,
  ],
  templateUrl: './profile.html',
  styleUrl: './profile.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfilePage implements OnInit {
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly authService = inject(AuthService);
  private readonly languageService = inject(LanguageService);
  private readonly profileService = inject(ProfileService);
  private readonly notifications = inject(NotificationService);
  private readonly popup = inject(PopupService);
  private readonly transloco = inject(TranslocoService);
  private readonly destroyRef = inject(DestroyRef);

  readonly currentUser = this.authService.currentUser;

  readonly isSavingProfile = signal(false);
  readonly isChangingPassword = signal(false);
  readonly isDeletingAccount = signal(false);
  readonly isLoadingPreferences = signal(true);
  readonly isSavingPreferences = signal(false);

  languageOptions(): SelectOption[] {
    return [
      {
        value: Language.PL,
        label: this.transloco.translate('PROFILE.PREFERENCES.LANGUAGES.PL'),
      },
      {
        value: Language.EN,
        label: this.transloco.translate('PROFILE.PREFERENCES.LANGUAGES.EN'),
      },
    ];
  }

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

  readonly preferencesForm = this.fb.group({
    lang: [this.languageService.getActiveLang()],
    notifyOnOutbid: [true],
    notifyOnAuctionEnd: [true],
  });

  ngOnInit(): void {
    this.profileService
      .getPreferences()
      .pipe(
        finalize(() => this.isLoadingPreferences.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (preferences) => {
          this.preferencesForm.patchValue(preferences);
          this.languageService.setLanguage(preferences.lang);
        },
      });
  }

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

  onPreferencesSubmit(): void {
    if (this.preferencesForm.invalid || this.isSavingPreferences()) return;

    this.isSavingPreferences.set(true);
    const preferences = this.preferencesForm.getRawValue() as ProfilePreferences;

    this.profileService
      .updatePreferences(preferences)
      .pipe(
        finalize(() => this.isSavingPreferences.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (savedPreferences) => {
          this.preferencesForm.patchValue(savedPreferences);
          this.languageService.setLanguage(savedPreferences.lang);
          this.notifications.success('PROFILE.PREFERENCES.SAVE_SUCCESS');
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
