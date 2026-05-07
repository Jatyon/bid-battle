import { Injectable, OnDestroy, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { environment } from '@env/environment';
import { TokenService } from '@core/index';
import { SocketConnection } from './socket-connection';

export type { ConnectionStatus } from './socket-connection';

/**
 * Global WebSocket connection registry.
 *
 * – Creates and stores `SocketConnection` instances per namespace
 * – SSR-safe: connections are only created in the browser
 * – Feature services (e.g. `BidSocketService`) retrieve or create
 *   their connection via `getOrCreate(namespace)`
 *
 * Usage example in a feature service:
 * ```ts
 * const conn = this.socketService.getOrCreate('/bid');
 * conn.connect();
 * conn.on<Payload>('event').pipe(...).subscribe(...);
 * ```
 */
@Injectable({ providedIn: 'root' })
export class SocketService implements OnDestroy {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly tokenService = inject(TokenService);

  private readonly connections = new Map<string, SocketConnection>();

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Returns an existing connection for the given namespace or creates a new one.
   * Must only be called in a browser context — throws if invoked during SSR.
   * Feature services are responsible for guarding with `isPlatformBrowser()`
   * before calling this method (see `BidSocketService.connect()` for the pattern).
   *
   * @param namespace  socket.io namespace, e.g. `'/bid'`
   * @throws {Error} when called outside of a browser environment
   */
  getOrCreate(namespace: string): SocketConnection {
    if (!this.isBrowser)
      throw new Error(
        `[SocketService] getOrCreate('${namespace}') was called during SSR. ` +
          `Guard the call site with isPlatformBrowser() before invoking this method.`,
      );

    if (!this.connections.has(namespace)) {
      const connection = new SocketConnection({
        url: `${environment.wsUrl}${namespace}`,
        getToken: () => this.tokenService.accessToken() ?? '',
      });
      this.connections.set(namespace, connection);
    }
    return this.connections.get(namespace)!;
  }

  /**
   * Disconnects and removes the connection for the given namespace.
   * Call this when the feature is destroyed and the connection is no longer needed.
   */
  remove(namespace: string): void {
    const connection = this.connections.get(namespace);
    if (connection) {
      connection.disconnect();
      this.connections.delete(namespace);
    }
  }

  /** Disconnects all active connections. */
  disconnectAll(): void {
    this.connections.forEach((conn) => conn.disconnect());
    this.connections.clear();
  }

  /** Returns true if a connection for the given namespace already exists in the registry. */
  has(namespace: string): boolean {
    return this.connections.has(namespace);
  }

  ngOnDestroy(): void {
    if (this.isBrowser) this.disconnectAll();
  }
}
