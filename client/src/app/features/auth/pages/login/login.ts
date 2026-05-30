import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink, Router } from '@angular/router';
import { ButtonComponent, InputComponent } from '@app/shared';
import { NotificationService, OAuthProvider, OAuthService } from '@core/index';
import { AuthService } from '@core/services/auth.service';
import type { LoginForm } from '@features/auth/models';
import { strongPasswordValidators } from '@features/auth/utils';
import { TranslocoDirective } from '@jsverse/transloco';
import { finalize } from 'rxjs';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, RouterLink, TranslocoDirective, InputComponent, ButtonComponent],
  templateUrl: './login.html',
  styleUrl: './login.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
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
    password: ['', strongPasswordValidators],
  });

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
        next: () => this.router.navigate(['/']),
        error: () => {
          // HTTP error toast is handled globally by errorInterceptor
        },
      });
  }

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
        error: () => {
          // HTTP error toast is handled globally by errorInterceptor
        },
      });
  }
}
