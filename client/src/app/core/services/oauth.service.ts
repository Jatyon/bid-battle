import { Injectable, inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { environment } from '@env/environment';
import { User } from '@core/models';
import { ApiService } from './api.service';
import { OAuthProvider } from '../types';
import { EMPTY, Observable, map, throwError } from 'rxjs';

interface OAuthExchangeResult {
  accessToken: string;
  user: User;
}

/**
 * A service that supports OAuth login flows.
 */
@Injectable({ providedIn: 'root' })
export class OAuthService {
  private readonly api = inject(ApiService);
  private readonly document = inject(DOCUMENT);

  login(provider: OAuthProvider): Observable<void> {
    switch (provider) {
      case 'google':
        return this.loginWithGoogle();
      case 'github':
        return this.loginWithGithub();
      default:
        return throwError(() => new Error(`Unsupported OAuth provider: ${provider}`));
    }
  }

  /**
   * Exchange a one-time code for an accessToken + user.
   * The code is removed by the backend after the first use.
   */
  exchangeCode(code: string): Observable<OAuthExchangeResult> {
    return this.api
      .get<OAuthExchangeResult>('/auth/oauth/exchange', { code })
      .pipe(map((res) => res.data));
  }

  private loginWithGoogle(): Observable<void> {
    const loc =
      this.document.defaultView?.location ??
      (typeof window !== 'undefined' ? window.location : null);
    if (loc) loc.href = `${environment.apiUrl}/auth/google`;
    return EMPTY;
  }

  private loginWithGithub(): Observable<void> {
    const loc =
      this.document.defaultView?.location ??
      (typeof window !== 'undefined' ? window.location : null);
    if (loc) loc.href = `${environment.apiUrl}/auth/github`;
    return EMPTY;
  }
}
