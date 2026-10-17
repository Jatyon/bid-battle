import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink, Router, ActivatedRoute } from '@angular/router';
import { ButtonComponent, InputComponent, PopupService } from '@app/shared';
import type { RegisterRequest } from '@core/models';
import { AuthService } from '@core/services';
import {
  passwordRepeatMatchValidator,
  resolveHttpError,
  strongPasswordValidators,
} from '@features/auth/utils';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-register',
  imports: [ReactiveFormsModule, RouterLink, TranslocoDirective, InputComponent, ButtonComponent],
  templateUrl: './register.html',
  styleUrl: './register.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegisterPage {
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly authService = inject(AuthService);
  private readonly popup = inject(PopupService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly transloco = inject(TranslocoService);

  readonly isLoading = signal(false);

  readonly form = this.fb.group({
    firstName: ['', [Validators.required]],
    lastName: ['', [Validators.required]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', strongPasswordValidators],
    passwordRepeat: ['', [Validators.required, passwordRepeatMatchValidator]],
  });

  constructor() {
    this.form.controls.password.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() =>
        this.form.controls.passwordRepeat.updateValueAndValidity({ onlySelf: true }),
      );
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    if (this.isLoading()) return;
    this.isLoading.set(true);

    try {
      const { firstName, lastName, email, password, passwordRepeat } = this.form.getRawValue();
      const request: RegisterRequest = { firstName, lastName, email, password, passwordRepeat };

      await firstValueFrom(this.authService.register(request));
      this.openInfoPopup();
    } catch (err: unknown) {
      if (err instanceof HttpErrorResponse) this.form.controls.email.setErrors({ serverError: resolveHttpError(err) });

    } finally {
      this.isLoading.set(false);
    }
  }

  private openInfoPopup(): void {
    this.popup
      .open({
        title: this.transloco.translate('AUTH.REGISTER.SUCCESS_TITLE'),
        message: this.transloco.translate('AUTH.REGISTER.SUCCESS_MESSAGE'),
        type: 'success',
        mode: 'info',
        confirmText: this.transloco.translate('COMMON.ACTIONS.UNDERSTOOD'),
      })
      .then(() => {
        const returnUrl = this.route.snapshot.queryParams['returnUrl'];
        void this.router.navigate(['/auth/login'], { queryParams: returnUrl ? { returnUrl } : undefined });
      });
  }
}
