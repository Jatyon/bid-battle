import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { ButtonComponent, InputComponent, PopupService } from '@app/shared';
import { AuthService } from '@core/index';
import type { ForgotPasswordForm } from '@features/auth/models';
import { resolveHttpError } from '@features/auth/utils';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { finalize } from 'rxjs';

@Component({
  selector: 'app-forgot-password',
  imports: [ReactiveFormsModule, RouterLink, TranslocoDirective, InputComponent, ButtonComponent],
  templateUrl: './forgot-password.html',
  styleUrl: './forgot-password.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ForgotPasswordPage {
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly authService = inject(AuthService);
  private readonly popup = inject(PopupService);
  private readonly transloco = inject(TranslocoService);
  private readonly destroyRef = inject(DestroyRef);

  readonly isLoading = signal(false);

  readonly form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
  });

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
        next: () => this.openSuccessPopup(),
        error: (err: HttpErrorResponse) => {
          this.form.controls.email.setErrors({ serverError: resolveHttpError(err) });
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
}
