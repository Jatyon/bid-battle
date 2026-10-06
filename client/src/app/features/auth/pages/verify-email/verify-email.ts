import {
  Component,
  ChangeDetectionStrategy,
  PLATFORM_ID,
  inject,
  input,
  signal,
  afterNextRender,
} from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Router, RouterLink } from '@angular/router';
import { isPlatformBrowser } from '@angular/common';
import { ButtonComponent, DotsLoaderComponent, InputComponent, PopupService } from '@app/shared';
import type { ResendVerificationRequest, VerifyEmailRequest } from '@core/models';
import { AuthService } from '@core/services';
import { resolveHttpError } from '@features/auth/utils';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';

type VerifyEmailStatus = 'loading' | 'success' | 'error' | 'no-token';

@Component({
  selector: 'app-verify-email',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    TranslocoDirective,
    InputComponent,
    ButtonComponent,
    DotsLoaderComponent,
  ],
  templateUrl: './verify-email.html',
  styleUrl: './verify-email.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VerifyEmailPage {
  readonly token = input<string>();

  private readonly platformId = inject(PLATFORM_ID);
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly authService = inject(AuthService);
  private readonly popup = inject(PopupService);
  private readonly router = inject(Router);
  private readonly transloco = inject(TranslocoService);

  private executed = false;

  readonly status = signal<VerifyEmailStatus>('loading');
  readonly errorMessage = signal('');
  readonly isResendLoading = signal(false);

  readonly resendForm = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
  });

  constructor() {
    afterNextRender(() => {
      void this.verifyFromQueryToken();
    });
  }

  goToLogin(): void {
    void this.router.navigate(['/auth/login']);
  }

  async onResendSubmit(): Promise<void> {
    if (this.resendForm.invalid) {
      this.resendForm.markAllAsTouched();
      return;
    }

    if (this.isResendLoading()) return;
    this.isResendLoading.set(true);

    try {
      const request: ResendVerificationRequest = this.resendForm.getRawValue();
      await firstValueFrom(this.authService.resendVerificationEmail(request));

      this.popup.open({
        title: this.transloco.translate('AUTH.VERIFY_EMAIL.RESEND_SUCCESS_TITLE'),
        message: this.transloco.translate('AUTH.VERIFY_EMAIL.RESEND_SUCCESS_MESSAGE'),
        type: 'success',
        mode: 'info',
        confirmText: this.transloco.translate('COMMON.ACTIONS.UNDERSTOOD'),
      });
    } catch (err: unknown) {
      if (err instanceof HttpErrorResponse) this.resendForm.controls.email.setErrors({ serverError: resolveHttpError(err) });
    } finally {
      this.isResendLoading.set(false);
    }
  }

  private async verifyFromQueryToken(): Promise<void> {
    if (!isPlatformBrowser(this.platformId) || this.executed) return;
    this.executed = true;

    const tokenVal = this.token();

    if (!tokenVal) {
      this.status.set('no-token');
      return;
    }

    try {
      const request: VerifyEmailRequest = { token: tokenVal };
      await firstValueFrom(this.authService.verifyEmail(request));
      this.status.set('success');
    } catch (err: unknown) {
      const message =
        err instanceof HttpErrorResponse
          ? resolveHttpError(err) || this.transloco.translate('AUTH.VERIFY_EMAIL.ERROR_GENERIC')
          : this.transloco.translate('AUTH.VERIFY_EMAIL.ERROR_GENERIC');
      this.errorMessage.set(message);
      this.status.set('error');
    }
  }
}
