import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { ButtonComponent, InputComponent, PopupService } from '@app/shared';
import type { ForgotPasswordRequest } from '@core/models';
import { AuthService } from '@core/services';
import { resolveHttpError } from '@features/auth/utils';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';

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

  readonly isLoading = signal(false);

  readonly form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
  });

  async onSubmit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    if (this.isLoading()) return;
    this.isLoading.set(true);

    try {
      const request: ForgotPasswordRequest = this.form.getRawValue();
      await firstValueFrom(this.authService.forgotPassword(request));
      this.openSuccessPopup();
    } catch (err: unknown) {
      if (err instanceof HttpErrorResponse) this.form.controls.email.setErrors({ serverError: resolveHttpError(err) });
    } finally {
      this.isLoading.set(false);
    }
  }

  private openSuccessPopup(): void {
    this.popup.open({
      title: this.transloco.translate('AUTH.FORGOT_PASSWORD.SUCCESS_TITLE'),
      message: this.transloco.translate('AUTH.FORGOT_PASSWORD.SUCCESS_MESSAGE'),
      type: 'success',
      mode: 'info',
      confirmText: this.transloco.translate('COMMON.ACTIONS.UNDERSTOOD'),
    });
  }
}
