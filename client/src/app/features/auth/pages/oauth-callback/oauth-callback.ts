import { Component, inject, PLATFORM_ID, afterNextRender } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import { AuthService } from '@core/services/auth.service';
import { NotificationService, OAuthService } from '@app/core';
import { DotsLoaderComponent } from '@app/shared';
import { TranslocoModule } from '@jsverse/transloco';

/**
 * Strona pośrednicząca po GitHub OAuth callback (pełny redirect flow).
 *
 * Przepływ bezpieczny – access token NIE jest przekazywany w URL:
 *  1. Backend → redirect 302 → /auth/oauth-callback?code=UUID (jednorazowy kod w Redis, TTL 120s)
 *  2. Ta strona odczytuje `code` z query params
 *  3. Wywołuje GET /api/v1/auth/oauth/exchange?code=UUID
 *  4. Backend usuwa kod z Redis (jednorazowość) i zwraca accessToken + user
 *  5. AuthService.setSession() → Router.navigate(['/'])
 */
@Component({
  selector: 'app-oauth-callback',
  standalone: true,
  imports: [DotsLoaderComponent, TranslocoModule],
  templateUrl: './oauth-callback.html',
  styleUrl: './oauth-callback.scss',
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
