import {
  ChangeDetectionStrategy,
  Component,
  inject,
  PLATFORM_ID,
  afterNextRender,
} from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { isPlatformBrowser } from '@angular/common';
import { NotificationService, OAuthService } from '@app/core';
import { DotsLoaderComponent } from '@app/shared';
import { AuthService } from '@core/services/auth.service';
import { TranslocoDirective } from '@jsverse/transloco';

/**
 * Intermediary page for the OAuth callback (full redirect flow).
 *
 * Secure flow – the access token is NOT passed in the URL:
 * 1. Backend → 302 redirect → /auth/oauth-callback?code=UUID (one-time code in Redis, TTL 120s)
 * 2. This page reads the `code` from the query parameters
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
  private readonly platformId = inject(PLATFORM_ID);
  private readonly authService = inject(AuthService);
  private readonly notifications = inject(NotificationService);
  private readonly oauthService = inject(OAuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  private executed = false;

  constructor() {
    afterNextRender(() => {
      this.processCallback();
    });
  }

  private processCallback(): void {
    if (!isPlatformBrowser(this.platformId) || this.executed) return;
    this.executed = true;

    const error = this.route.snapshot.queryParamMap.get('error');

    if (error) {
      this.router.navigate(['/auth/login']);
      this.notifications.error(error);
      return;
    }

    const code = this.route.snapshot.queryParamMap.get('code');

    if (!code) {
      this.router.navigate(['/auth/login']);
      return;
    }
    
    this.oauthService.exchangeCode(code).subscribe({
      next: ({ accessToken, user }) => {
        this.authService.setSession(accessToken, user);
        this.router.navigate(['/']);
      },
      error: () => {
        this.router.navigate(['/auth/login']);
      },
    });
  }
}
