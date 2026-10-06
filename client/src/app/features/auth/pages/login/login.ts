import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink, Router } from '@angular/router';
import { ButtonComponent, InputComponent } from '@app/shared';
import { NotificationService, OAuthProvider, OAuthService } from '@core/index';
import { AuthService } from '@core/services/auth.service';
import type { LoginRequest } from '@core/models';
import { TranslocoDirective } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';

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

  readonly isLoading = signal(false);
  readonly isOAuthLoading = signal<OAuthProvider | null>(null);

  readonly form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });

  async onSubmit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    if (this.isLoading()) return;

    this.isLoading.set(true);

    try {
      const credentials: LoginRequest = this.form.getRawValue();
      await firstValueFrom(this.authService.login(credentials));
      void this.router.navigate(['/']);
    } catch {
      // HTTP error toast is handled globally by errorInterceptor
    } finally {
      this.isLoading.set(false);
    }
  }

  async onOAuthLogin(provider: OAuthProvider): Promise<void> {
    if (this.isOAuthLoading()) return;
    this.isOAuthLoading.set(provider);

    try {
      await firstValueFrom(this.oauthService.login(provider));
      this.notifications.success('AUTH.LOGIN.SUCCESS');
      void this.router.navigate(['/']);
    } catch {
      // HTTP error toast is handled globally by errorInterceptor
    } finally {
      this.isOAuthLoading.set(null);
    }
  }
}
