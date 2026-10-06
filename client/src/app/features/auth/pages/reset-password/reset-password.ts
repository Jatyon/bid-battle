import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  inject,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { Router, RouterLink } from '@angular/router';
import { ButtonComponent, InputComponent, PopupService } from '@app/shared';
import { AuthService, NotificationService } from '@core/index';
import type { ResetPasswordRequest } from '@core/models';
import {
  passwordRepeatMatchValidator,
  resolveHttpError,
  strongPasswordValidators,
} from '@features/auth/utils';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-reset-password',
  imports: [ReactiveFormsModule, RouterLink, TranslocoDirective, InputComponent, ButtonComponent],
  templateUrl: './reset-password.html',
  styleUrl: './reset-password.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResetPasswordPage implements OnInit {
  readonly token = input<string>();

  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly authService = inject(AuthService);
  private readonly notifications = inject(NotificationService);
  private readonly popup = inject(PopupService);
  private readonly router = inject(Router);
  private readonly transloco = inject(TranslocoService);
  private readonly destroyRef = inject(DestroyRef);

  readonly isLoading = signal(false);

  readonly form = this.fb.group({
    password: ['', strongPasswordValidators],
    passwordRepeat: ['', [Validators.required, passwordRepeatMatchValidator]],
  });

  ngOnInit(): void {
    this.form.controls.password.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() =>
        this.form.controls.passwordRepeat.updateValueAndValidity({ onlySelf: true }),
      );
  }

  async onSubmit(): Promise<void> {
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

    try {
      const { password, passwordRepeat } = this.form.getRawValue();
      const request: ResetPasswordRequest = { token: resetToken, password, passwordRepeat };

      await firstValueFrom(this.authService.resetPassword(request));
      this.openSuccessPopup();
    } catch (err: unknown) {
      if (err instanceof HttpErrorResponse) this.form.controls.password.setErrors({ serverError: resolveHttpError(err) });
    } finally {
      this.isLoading.set(false);
    }
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
        confirmText: this.transloco.translate('COMMON.ACTIONS.UNDERSTOOD'),
      })
      .then(() => this.router.navigate(['/auth/login']));
  }
}
