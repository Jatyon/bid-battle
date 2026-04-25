import { Injectable, signal } from '@angular/core';
import { BehaviorSubject, Observable, filter, take } from 'rxjs';

/**
 * Manages the in-memory access token.
 * The access token is NEVER persisted to localStorage/sessionStorage —
 * it lives only in Angular memory and is lost on page reload.
 * A new one is obtained via the HttpOnly-cookie-based refresh flow.
 *
 * Also exposes the refresh-queuing primitives used by the refresh interceptor.
 */
@Injectable({ providedIn: 'root' })
export class TokenService {
  private readonly _accessToken = signal<string | null>(null);

  /** Read-only access token for the auth interceptor. */
  readonly accessToken = this._accessToken.asReadonly();

  private _isRefreshing = false;
  private readonly _refreshSubject = new BehaviorSubject<string | null>(null);

  get isRefreshing(): boolean {
    return this._isRefreshing;
  }

  /** Sets the token after a successful login or token refresh. */
  setAccessToken(token: string): void {
    this._accessToken.set(token);
  }

  /** Clears the token on logout or failed refresh. */
  clearAccessToken(): void {
    this._accessToken.set(null);
  }

  /**
   * Called by the refresh interceptor when a 401 is detected.
   * Marks refresh as in-progress and resets the subject.
   */
  startRefresh(): void {
    this._isRefreshing = true;
    this._refreshSubject.next(null);
  }

  /**
   * Called after a successful token refresh.
   * Notifies all queued requests with the new token.
   */
  resolveRefresh(newToken: string): void {
    this._isRefreshing = false;
    this.setAccessToken(newToken);
    this._refreshSubject.next(newToken);
  }

  /**
   * Called when the refresh request itself fails.
   * Signals queued requests that they should abort.
   */
  rejectRefresh(): void {
    this._isRefreshing = false;
    this._refreshSubject.next(null);
  }

  /**
   * Returns an observable that queued requests can wait on.
   */
  waitForToken(): Observable<string | null> {
    return this._refreshSubject.pipe(
      filter(() => !this.isRefreshing),
      take(1),
    );
  }
}
