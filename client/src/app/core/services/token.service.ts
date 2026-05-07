import { Injectable, signal } from '@angular/core';
import { Observable, Subject, of, take } from 'rxjs';

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

  private readonly _isRefreshing = signal(false);
  private readonly _refreshSubject = new Subject<string | null>();

  get isRefreshing(): boolean {
    return this._isRefreshing();
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
    this._isRefreshing.set(true);
  }

  /**
   * Called after a successful token refresh.
   * Notifies all queued requests with the new token.
   */
  resolveRefresh(newToken: string): void {
    this._isRefreshing.set(false);
    this.setAccessToken(newToken);
    this._refreshSubject.next(newToken);
  }

  /**
   * Called when the refresh request itself fails.
   * Signals queued requests that they should abort.
   */
  rejectRefresh(): void {
    this._isRefreshing.set(false);
    this._refreshSubject.next(null);
  }

  /**
   * Returns an observable that queued requests can wait on.
   *
   * Two cases:
   *  a) Refresh is still in progress → wait for the next emission from the subject.
   *     Subject (not BehaviorSubject) never replays, so no stale null can leak through.
   *     `resolveRefresh` emits the new token; `rejectRefresh` emits null — both handled
   *     by the caller in the refresh interceptor.
   *  b) Refresh already completed before this call → emit the current in-memory token
   *     immediately via `of()`.
   */
  waitForToken(): Observable<string | null> {
    if (!this._isRefreshing()) return of(this._accessToken());

    return this._refreshSubject.pipe(take(1));
  }
}
