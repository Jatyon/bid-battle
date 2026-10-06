import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  PLATFORM_ID,
  afterNextRender,
} from '@angular/core';
import { Router } from '@angular/router';
import { isPlatformBrowser } from '@angular/common';
import { NotificationService, OAuthService, AuthService } from '@app/core';
import { DotsLoaderComponent } from '@app/shared';
import { TranslocoDirective } from '@jsverse/transloco';

/**
 * Intermediary page for the OAuth callback (full redirect flow).
 *
 * Secure flow – the access token is NOT passed in the URL:
 * 1. Backend → 302 redirect → /auth/oauth-callback?code=UUID (one-time code in Redis, TTL 120s)
 * 2. This page reads the `code` from the query parameters via route input signal
 * 3. Calls GET /api/v1/auth/oauth/exchange?code=UUID
 * 4. Backend removes the code from Redis (single-use) and returns the accessToken + user
 * 5. AuthService.setSession() → Router.navigate(['/'])
 */
@Component({
  selector: 'app-oauth-callback',
  imports: [DotsLoaderComponent, TranslocoDirective],
  templateUrl: './oauth-callback.html',
  styleUrl: './oauth-callback.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OAuthCallbackPage {
  readonly code = input<string>();
  readonly error = input<string>();

  private readonly platformId = inject(PLATFORM_ID);
  private readonly authService = inject(AuthService);
  private readonly notifications = inject(NotificationService);
  private readonly oauthService = inject(OAuthService);
  private readonly router = inject(Router);

  private executed = false;

  constructor() {
    afterNextRender(() => {
      this.processCallback();
    });
  }

  private processCallback(): void {
    if (!isPlatformBrowser(this.platformId) || this.executed) return;
    this.executed = true;

    const err = this.error();
    if (err) {
      void this.router.navigate(['/auth/login']);
      this.notifications.error(err);
      return;
    }

    const codeVal = this.code();
    if (!codeVal) {
      void this.router.navigate(['/auth/login']);
      return;
    }

    this.oauthService.exchangeCode(codeVal).subscribe({
      next: ({ accessToken, user }) => {
        this.authService.setSession(accessToken, user);
        void this.router.navigate(['/']);
      },
      error: () => {
        void this.router.navigate(['/auth/login']);
      },
    });
  }
}
