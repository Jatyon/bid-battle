import { Component, DestroyRef, PLATFORM_ID, inject, signal, afterNextRender } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { isPlatformBrowser } from '@angular/common';
import { ButtonComponent, DotsLoaderComponent, InputComponent, PopupService } from '@app/shared';
import { AuthService, NotificationService } from '@core/index';
import type { ResendVerificationForm } from '@features/auth/models';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { finalize } from 'rxjs';

type VerifyEmailStatus = 'loading' | 'success' | 'error' | 'no-token';

@Component({
  selector: 'app-verify-email',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    TranslocoModule,
    InputComponent,
    ButtonComponent,
    DotsLoaderComponent,
  ],
  templateUrl: './verify-email.html',
  styleUrl: './verify-email.scss',
})
export class VerifyEmailPage {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly authService = inject(AuthService);
  private readonly notifications = inject(NotificationService);
  private readonly popup = inject(PopupService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly transloco = inject(TranslocoService);
  private readonly destroyRef = inject(DestroyRef);

  private executed = false;

  readonly status = signal<VerifyEmailStatus>('loading');
  readonly errorMessage = signal('');
  readonly isResendLoading = signal(false);

  readonly resendForm = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
  });

  constructor() {
    afterNextRender(() => {
      this.verifyFromQueryToken();
    });
  }

  get emailControl() {
    return this.resendForm.controls.email;
  }

  get emailErrorKey(): string {
    const c = this.emailControl;
    if (!c.invalid || !c.touched) return '';
    if (c.errors?.['required']) return 'AUTH.VALIDATION.EMAIL_REQUIRED';
    if (c.errors?.['email']) return 'AUTH.VALIDATION.EMAIL_INVALID';
    return '';
  }

  goToLogin(): void {
    void this.router.navigate(['/auth/login']);
  }

  onResendSubmit(): void {
    if (this.resendForm.invalid) {
      this.resendForm.markAllAsTouched();
      return;
    }

    if (this.isResendLoading()) return;

    this.isResendLoading.set(true);

    const data: ResendVerificationForm = this.resendForm.getRawValue();

    this.authService
      .resendVerificationEmail(data)
      .pipe(
        finalize(() => this.isResendLoading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          this.popup.open({
            title: this.transloco.translate('AUTH.VERIFY_EMAIL.RESEND_SUCCESS_TITLE'),
            message: this.transloco.translate('AUTH.VERIFY_EMAIL.RESEND_SUCCESS_MESSAGE'),
            type: 'success',
            mode: 'info',
            confirmText: this.transloco.translate('AUTH.VERIFY_EMAIL.RESEND_SUCCESS_CONFIRM'),
          });
        },
        error: (err) => {
          const message = err?.error?.message || 'AUTH.VERIFY_EMAIL.RESEND_ERROR_GENERIC';
          this.notifications.error(message);
        },
      });
  }

  private verifyFromQueryToken(): void {
    if (!isPlatformBrowser(this.platformId) || this.executed) return;
    this.executed = true;

    const token = this.route.snapshot.queryParamMap.get('token');

    if (!token) {
      this.status.set('no-token');
      return;
    }

    this.authService
      .verifyEmail(token)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.status.set('success');
        },
        error: (err) => {
          const message =
            err?.error?.message || this.transloco.translate('AUTH.VERIFY_EMAIL.ERROR_GENERIC');
          this.errorMessage.set(message);
          this.status.set('error');
        },
      });
  }
}
