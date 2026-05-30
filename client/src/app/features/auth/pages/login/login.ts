import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink, Router } from '@angular/router';
import { ButtonComponent, InputComponent } from '@app/shared';
import { NotificationService, OAuthProvider, OAuthService } from '@core/index';
import { AuthService } from '@core/services/auth.service';
import type { LoginForm } from '@features/auth/models';
import { TranslocoModule } from '@jsverse/transloco';
import { finalize } from 'rxjs';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, TranslocoModule, InputComponent, ButtonComponent],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class LoginPage {
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly authService = inject(AuthService);
  private readonly oauthService = inject(OAuthService);
  private readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  readonly isLoading = signal(false);
  readonly isOAuthLoading = signal<OAuthProvider | null>(null);

  readonly form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: [
      '',
      [
        Validators.required,
        Validators.minLength(8),
        Validators.pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).*$/),
      ],
    ],
  });

  get emailControl() {
    return this.form.controls.email;
  }

  get passwordControl() {
    return this.form.controls.password;
  }

  get emailErrorKey(): string {
    const c = this.emailControl;
    if (!c.invalid || !c.touched) return '';
    if (c.errors?.['required']) return 'AUTH.VALIDATION.EMAIL_REQUIRED';
    if (c.errors?.['email']) return 'AUTH.VALIDATION.EMAIL_INVALID';
    return '';
  }

  get passwordErrorKey(): string {
    const c = this.passwordControl;
    if (!c.invalid || !c.touched) return '';
    if (c.errors?.['required']) return 'AUTH.VALIDATION.PASSWORD_REQUIRED';
    if (c.errors?.['minlength']) return 'AUTH.VALIDATION.PASSWORD_MIN';
    if (c.errors?.['pattern']) return 'AUTH.VALIDATION.PASSWORD_TOO_WEAK';
    return '';
  }

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    if (this.isLoading()) return;

    this.isLoading.set(true);

    const credentials: LoginForm = this.form.getRawValue();

    this.authService
      .login(credentials)
      .pipe(
        finalize(() => this.isLoading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          this.router.navigate(['/']);
        },
        error: (err) => {
          const message = err?.error?.message || 'AUTH.LOGIN.ERROR_GENERIC';
          this.notifications.error(message);
          this.focusFirstInvalidField();
        },
      });
  }

  private focusFirstInvalidField(): void {
    const firstInvalidControl = Object.keys(this.form.controls).find(
      (key) => this.form.get(key)?.invalid,
    );

    if (firstInvalidControl) {
      const element = document.getElementById(`input-${firstInvalidControl}`);
      element?.focus();
    }
  }

  /**
   * Run OAuth login flow for the specified provider.
   */
  onOAuthLogin(provider: OAuthProvider): void {
    if (this.isOAuthLoading()) return;

    this.isOAuthLoading.set(provider);

    this.oauthService
      .login(provider)
      .pipe(
        finalize(() => this.isOAuthLoading.set(null)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          this.notifications.success('AUTH.LOGIN.SUCCESS');
          this.router.navigate(['/']);
        },
        error: (err: unknown) => {
          const message = (err as { message?: string })?.message || 'AUTH.LOGIN.GOOGLE_ERROR';
          this.notifications.error(message);
        },
      });
  }
}
