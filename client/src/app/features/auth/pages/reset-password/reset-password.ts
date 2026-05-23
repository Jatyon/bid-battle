import {
  ReactiveFormsModule,
  FormBuilder,
  Validators,
  ValidationErrors,
  AbstractControl,
} from '@angular/forms';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ButtonComponent, InputComponent, PopupService } from '@app/shared';
import { AuthService, NotificationService } from '@core/index';
import type { ResetPasswordForm } from '@features/auth/models';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { finalize } from 'rxjs/internal/operators/finalize';

@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, TranslocoModule, InputComponent, ButtonComponent],
  templateUrl: './reset-password.html',
  styleUrl: './reset-password.scss',
})
export class ResetPasswordPage {
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly authService = inject(AuthService);
  private readonly notifications = inject(NotificationService);
  private readonly popup = inject(PopupService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly transloco = inject(TranslocoService);
  private readonly destroyRef = inject(DestroyRef);

  readonly isLoading = signal(false);
  readonly token = signal<string | null>(this.route.snapshot.queryParamMap.get('token'));

  readonly form = this.fb.group(
    {
      password: [
        '',
        [
          Validators.required,
          Validators.minLength(8),
          Validators.pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).*$/),
        ],
      ],
      passwordRepeat: [
        '',
        [
          Validators.required,
          Validators.minLength(8),
          Validators.pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).*$/),
        ],
      ],
    },
    { validators: this.passwordMatchValidator },
  );

  get passwordControl() {
    return this.form.controls.password;
  }

  get passwordRepeatControl() {
    return this.form.controls.passwordRepeat;
  }

  get passwordErrorKey(): string {
    const c = this.passwordControl;
    if (!c.invalid || !c.touched) return '';
    if (c.errors?.['required']) return 'AUTH.VALIDATION.PASSWORD_REQUIRED';
    if (c.errors?.['minlength']) return 'AUTH.VALIDATION.PASSWORD_MIN';
    if (c.errors?.['pattern']) return 'AUTH.VALIDATION.PASSWORD_TOO_WEAK';
    return '';
  }

  get passwordRepeatErrorKey(): string {
    const c = this.passwordRepeatControl;
    if (!c.touched) return '';
    if (c.errors?.['required']) return 'AUTH.VALIDATION.PASSWORD_REPEAT_REQUIRED';
    if (c.errors?.['minlength']) return 'AUTH.VALIDATION.PASSWORD_MIN';
    if (c.errors?.['pattern']) return 'AUTH.VALIDATION.PASSWORD_TOO_WEAK';
    if (this.form.errors?.['passwordMismatch']) return 'AUTH.VALIDATION.PASSWORD_MISMATCH';
    return '';
  }

  private passwordMatchValidator(control: AbstractControl): ValidationErrors | null {
    const password = control.get('password')?.value;
    const passwordRepeat = control.get('passwordRepeat')?.value;

    return password === passwordRepeat ? null : { passwordMismatch: true };
  }

  onSubmit(): void {
    const resetToken = this.token();
    if (!resetToken) {
      this.notifications.error('AUTH.RESET_PASSWORD.ERROR_NO_TOKEN');
      return;
    }

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    if (this.isLoading()) return;

    this.isLoading.set(true);

    const formValue = this.form.getRawValue();
    const data: ResetPasswordForm = {
      token: resetToken,
      password: formValue.password,
      passwordRepeat: formValue.passwordRepeat,
    };

    this.authService
      .resetPassword(data)
      .pipe(
        finalize(() => this.isLoading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          this.openSuccessPopup();
        },
        error: (err) => {
          const message = err?.error?.message || 'AUTH.RESET_PASSWORD.ERROR_GENERIC';
          this.notifications.error(message);
          this.focusFirstInvalidField();
        },
      });
  }

  requestNewLink(): void {
    void this.router.navigate(['/auth/forgot-password']);
  }

  private openSuccessPopup(): void {
    this.popup
      .open({
        title: this.transloco.translate('AUTH.RESET_PASSWORD.SUCCESS_TITLE'),
        message: this.transloco.translate('AUTH.RESET_PASSWORD.SUCCESS_MESSAGE'),
        type: 'success',
        mode: 'info',
        confirmText: this.transloco.translate('AUTH.RESET_PASSWORD.SUCCESS_CONFIRM'),
      })
      .then(() => this.router.navigate(['/auth/login']));
  }

  private focusFirstInvalidField(): void {
    const firstInvalidControl = Object.keys(this.form.controls).find(
      (key) => this.form.get(key)?.invalid,
    );

    if (firstInvalidControl) document.getElementById(`input-${firstInvalidControl}`)?.focus();
  }
}
