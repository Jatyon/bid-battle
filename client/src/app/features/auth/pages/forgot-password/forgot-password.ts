import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { ButtonComponent, InputComponent, PopupService } from '@app/shared';
import { AuthService, NotificationService } from '@core/index';
import type { ForgotPasswordForm } from '@features/auth/models';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { finalize } from 'rxjs';

@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, TranslocoModule, InputComponent, ButtonComponent],
  templateUrl: './forgot-password.html',
  styleUrl: './forgot-password.scss',
})
export class ForgotPasswordPage {
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly authService = inject(AuthService);
  private readonly notifications = inject(NotificationService);
  private readonly popup = inject(PopupService);
  private readonly transloco = inject(TranslocoService);
  private readonly destroyRef = inject(DestroyRef);

  readonly isLoading = signal(false);

  readonly form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
  });

  get emailControl() {
    return this.form.controls.email;
  }

  get emailErrorKey(): string {
    const c = this.emailControl;
    if (!c.invalid || !c.touched) return '';
    if (c.errors?.['required']) return 'AUTH.VALIDATION.EMAIL_REQUIRED';
    if (c.errors?.['email']) return 'AUTH.VALIDATION.EMAIL_INVALID';
    return '';
  }

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    if (this.isLoading()) return;

    this.isLoading.set(true);

    const data: ForgotPasswordForm = this.form.getRawValue();

    this.authService
      .forgotPassword(data)
      .pipe(
        finalize(() => this.isLoading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          this.openSuccessPopup();
        },
        error: (err) => {
          const message = err?.error?.message || 'AUTH.FORGOT_PASSWORD.ERROR_GENERIC';
          this.notifications.error(message);
          this.focusFirstInvalidField();
        },
      });
  }

  private openSuccessPopup(): void {
    this.popup.open({
      title: this.transloco.translate('AUTH.FORGOT_PASSWORD.SUCCESS_TITLE'),
      message: this.transloco.translate('AUTH.FORGOT_PASSWORD.SUCCESS_MESSAGE'),
      type: 'success',
      mode: 'info',
      confirmText: this.transloco.translate('AUTH.FORGOT_PASSWORD.SUCCESS_CONFIRM'),
    });
  }

  private focusFirstInvalidField(): void {
    if (this.emailControl.invalid) document.getElementById('input-email')?.focus();
  }
}
