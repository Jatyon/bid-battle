import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ButtonComponent, InputComponent, PopupService } from '@app/shared';
import { AuthService, NotificationService } from '@core/index';
import type { ResetPasswordForm } from '@features/auth/models';
import {
  passwordRepeatMatchValidator,
  resolveHttpError,
  strongPasswordValidators,
} from '@features/auth/utils';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { finalize } from 'rxjs';

@Component({
  selector: 'app-reset-password',
  imports: [ReactiveFormsModule, RouterLink, TranslocoDirective, InputComponent, ButtonComponent],
  templateUrl: './reset-password.html',
  styleUrl: './reset-password.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResetPasswordPage implements OnInit {
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

    const { password, passwordRepeat } = this.form.getRawValue();
    const data: ResetPasswordForm = { token: resetToken, password, passwordRepeat };

    this.authService
      .resetPassword(data)
      .pipe(
        finalize(() => this.isLoading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => this.openSuccessPopup(),
        error: (err: HttpErrorResponse) => {
          this.form.controls.password.setErrors({ serverError: resolveHttpError(err) });
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
}
