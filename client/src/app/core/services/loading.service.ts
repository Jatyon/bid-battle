import { Injectable, computed, signal } from '@angular/core';

/**
 * Global loading service.
 * Tracks the number of active HTTP requests and exposes
 * a boolean `isLoading` signal for use in templates.
 */
@Injectable({ providedIn: 'root' })
export class LoadingService {
  private readonly _activeRequests = signal(0);

  readonly isLoading = computed(() => this._activeRequests() > 0);

  start(): void {
    this._activeRequests.update((n) => n + 1);
  }

  stop(): void {
    this._activeRequests.update((n) => Math.max(0, n - 1));
  }
}
